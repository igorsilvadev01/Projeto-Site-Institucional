import { randomUUID, createHash } from "node:crypto";
import { authDatabase, requireUser, requireAdmin, recordAudit } from "./auth.js";
import { body, email, field, guard, json, reject } from "./core.js";
import { deliveryDatabase } from "./contact-delivery.js";

export function portalDatabase() {
  const db = authDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS action_progress (
      assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE, action_id TEXT NOT NULL,
      assignee TEXT NOT NULL DEFAULT '', due_date TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pendente',
      PRIMARY KEY(assessment_id,action_id)
    );
    CREATE TABLE IF NOT EXISTS client_requests (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),subject TEXT NOT NULL,
      message TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'aberta',reply TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS requests_user ON client_requests(user_id);
    CREATE TABLE IF NOT EXISTS request_reads (
      request_id TEXT PRIMARY KEY REFERENCES client_requests(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),reply_hash TEXT NOT NULL,read_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS client_services (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,
      description TEXT NOT NULL,status TEXT NOT NULL,due_date TEXT NOT NULL DEFAULT '',updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS services_user ON client_services(user_id);
  `);
  return db;
}

const replyVersion = row => createHash("sha256").update(JSON.stringify([row.reply, row.updated_at])).digest("hex");
const accountVersion = row => createHash("sha256").update(JSON.stringify([row.name, row.email, row.role])).digest("hex");

export function portalData(user) {
  const db = portalDatabase();
  const assessments = db.prepare(`SELECT a.id,a.company,a.created_at,a.report FROM assessments a
    JOIN assessment_owners o ON o.assessment_id=a.id WHERE o.user_id=? ORDER BY a.created_at DESC,a.id`).all(user.id)
    .map(row => ({ id: row.id, company: row.company, createdAt: row.created_at, ...JSON.parse(row.report) }));
  const client = user.role === "cliente" || user.role === "admin";
  const progress = client ? db.prepare(`SELECT p.* FROM action_progress p JOIN assessment_owners o ON o.assessment_id=p.assessment_id WHERE o.user_id=?`).all(user.id) : [];
  return {
    assessments, progress,
    requests: client ? db.prepare(`SELECT r.*,v.reply_hash AS read_hash FROM client_requests r
      LEFT JOIN request_reads v ON v.request_id=r.id AND v.user_id=r.user_id
      WHERE r.user_id=? ORDER BY r.updated_at DESC,r.id`).all(user.id).map(({ read_hash, ...row }) => ({
        ...row, replyVersion: row.reply ? replyVersion(row) : "", unread: !!row.reply && read_hash !== replyVersion(row),
      })) : [],
    services: client ? db.prepare("SELECT * FROM client_services WHERE user_id=? ORDER BY updated_at DESC").all(user.id) : [],
    documents: client ? db.prepare(`SELECT e.id,e.name,e.assessment_id,a.company FROM evidences e
      JOIN assessment_owners o ON o.assessment_id=e.assessment_id JOIN assessments a ON a.id=e.assessment_id WHERE o.user_id=? ORDER BY e.created_at DESC`).all(user.id) : [],
  };
}

function access(request, admin = false) {
  const user = requireUser(request);
  if (admin) requireAdmin(user);
  else if (!["cliente", "admin"].includes(user.role)) reject(403, "Seu perfil não tem acesso a este recurso.");
  return user;
}

function date(value) {
  const result = field(value, "Prazo", 10, false);
  if (result && (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result)) reject(400, "Informe uma data válida.");
  return result;
}

export function adminSummary(user) {
  requireAdmin(user);
  const db = portalDatabase();
  const since = Date.now() - 86_400_000;
  return {
    users: db.prepare("SELECT COUNT(*) AS n FROM users").get().n,
    clients: db.prepare("SELECT COUNT(*) AS n FROM user_access WHERE role='cliente'").get().n,
    openRequests: db.prepare("SELECT COUNT(*) AS n FROM client_requests WHERE status!='concluida'").get().n,
    activeServices: db.prepare("SELECT COUNT(*) AS n FROM client_services WHERE status!='concluido'").get().n,
    acceptedEmails: db.prepare("SELECT COUNT(*) AS n FROM email_events WHERE status='accepted' AND created_at>=?").get(since).n,
    failedEmails: db.prepare("SELECT COUNT(*) AS n FROM email_events WHERE status='failed' AND created_at>=?").get(since).n,
    recentRequests: db.prepare("SELECT r.id,r.subject,r.status,r.updated_at,u.name FROM client_requests r JOIN users u ON u.id=r.user_id WHERE r.status!='concluida' ORDER BY r.created_at ASC LIMIT 5").all(),
  };
}

export function adminData(user, options = {}) {
  requireAdmin(user);
  const db = portalDatabase();
  const scalar = value => typeof value === "string" ? value : "";
  const q = scalar(options.q).trim().slice(0, 160);
  const search = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const page = Math.max(1, Math.min(100000, Number.parseInt(scalar(options.page), 10) || 1));
  const pageSize = 25;
  const tab = ["usuarios", "solicitacoes", "emails", "servicos", "operacao"].includes(options.tab) ? options.tab : "visao-geral";
  const role = ["usuario", "cliente", "admin"].includes(options.role) ? options.role : "";
  const status = scalar(options.status), category = scalar(options.category), period = scalar(options.period);
  const userId = scalar(options.userId).slice(0, 36);
  const userWhere = [], userArgs = [], requestWhere = [], requestArgs = [], emailWhere = [], emailArgs = [];
  if (q) {
    userWhere.push("(u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')"); userArgs.push(search, search);
    requestWhere.push("(r.subject LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')"); requestArgs.push(search, search, search);
    emailWhere.push("(e.recipient LIKE ? ESCAPE '\\' OR e.subject LIKE ? ESCAPE '\\')"); emailArgs.push(search, search);
  }
  if (role) { userWhere.push("COALESCE(a.role,'usuario')=?"); userArgs.push(role); }
  if (status === "ativas") {
    userWhere.push("EXISTS(SELECT 1 FROM client_requests r WHERE r.user_id=u.id AND r.status!='concluida')");
    requestWhere.push("r.status!='concluida'");
  } else if (["aberta", "andamento", "concluida"].includes(status)) { requestWhere.push("r.status=?"); requestArgs.push(status); }
  if (userId) { requestWhere.push("r.user_id=?"); requestArgs.push(userId); }
  if (["sending", "accepted", "failed", "local"].includes(status)) { emailWhere.push("e.status=?"); emailArgs.push(status); }
  if (["cadastro", "recuperacao", "contato", "newsletter", "verificacao", "teste", "outro"].includes(category)) { emailWhere.push("e.category=?"); emailArgs.push(category); }
  if (["1", "7", "30"].includes(period)) { emailWhere.push("e.created_at>=?"); emailArgs.push(Date.now() - Number(period) * 86_400_000); }
  const usersFrom = "users u LEFT JOIN user_access a ON a.user_id=u.id LEFT JOIN verified_emails v ON v.user_id=u.id";
  const requestsFrom = "client_requests r JOIN users u ON u.id=r.user_id";
  const where = clauses => clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  const list = (name, fields, from, conditions, args, order) => {
    const total = db.prepare(`SELECT COUNT(*) AS n FROM ${from}${where(conditions)}`).get(...args).n;
    const pages = Math.max(1, Math.ceil(total / pageSize)), current = Math.min(page, pages);
    const limited = tab === name;
    return { total, pages, page: current, rows: db.prepare(`SELECT ${fields} FROM ${from}${where(conditions)} ORDER BY ${order}${limited ? " LIMIT ? OFFSET ?" : " LIMIT 25"}`)
      .all(...args, ...(limited ? [pageSize, (current - 1) * pageSize] : [])) };
  };
  const users = list("usuarios", "u.id,u.name,u.email,u.created_at,COALESCE(a.role,'usuario') AS role,v.verified_at,(SELECT COUNT(*) FROM client_requests r WHERE r.user_id=u.id AND r.status!='concluida') AS open_requests", usersFrom, userWhere, userArgs, "u.created_at DESC,u.id");
  users.rows = users.rows.map(row => ({ ...row, version: accountVersion(row) }));
  const requests = list("solicitacoes", "r.*,u.name,u.email", requestsFrom, requestWhere, requestArgs, "r.updated_at DESC,r.id");
  const emails = list("emails", "e.*", "email_events e", emailWhere, emailArgs, "e.created_at DESC,e.id");
  const services = list("servicos", "s.*,u.name", "client_services s JOIN users u ON u.id=s.user_id", [], [], "s.updated_at DESC,s.id");
  return {
    tab, filters: { q, role, status, category, period, userId },
    summary: adminSummary(user), users: users.rows, requests: requests.rows, services: services.rows, emails: emails.rows,
    pagination: { usuarios: users, solicitacoes: requests, emails, servicos: services },
    clients: db.prepare("SELECT u.id,u.name,u.email FROM users u JOIN user_access a ON a.user_id=u.id WHERE a.role='cliente' ORDER BY u.name,u.id").all(),
  };
}

function editAccount(db, actor, input) {
  const targetId = field(input.userId, "Usuário", 36);
  const name = field(input.name, "Nome", 120), address = email(input.email);
  const version = field(input.version, "Versão da conta", 64);
  if (name.length < 2) reject(400, "Informe um nome com pelo menos dois caracteres.");
  if (!["usuario", "cliente", "admin"].includes(input.role)) reject(400, "Perfil inválido.");
  if (!/^[a-f0-9]{64}$/.test(version)) reject(400, "Versão da conta inválida. Atualize a lista e tente novamente.");
  let emailChanged, roleChanged;
  db.exec("BEGIN IMMEDIATE");
  try {
    if (!db.prepare("SELECT u.id FROM users u JOIN user_access a ON a.user_id=u.id WHERE u.id=? AND a.role='admin'").get(actor.id))
      reject(403, "Acesso restrito à administração.");
    const target = db.prepare("SELECT u.id,u.name,u.email,COALESCE(a.role,'usuario') AS role FROM users u LEFT JOIN user_access a ON a.user_id=u.id WHERE u.id=?").get(targetId);
    if (!target) reject(404, "Conta não encontrada. Ela pode ter sido excluída.");
    if (version !== accountVersion(target)) reject(409, "A conta foi alterada. Recarregue os dados antes de salvar novamente.", { "X-Portal-Account-Conflict": "stale" });
    // Keep the existing policy: administrator roles are managed by the server operator.
    if ((target.role === "admin") !== (input.role === "admin")) reject(400, "O perfil de administrador é gerenciado pelo operador do servidor.");
    emailChanged = address !== target.email;
    roleChanged = input.role !== target.role;
    if (emailChanged) {
      if (db.prepare("SELECT id FROM users WHERE email=? AND id!=?").get(address, targetId)) reject(409, "Este email já está em uso por outra conta.");
      if (db.prepare("SELECT token_hash FROM pending_registrations WHERE email=? AND expires_at>?").get(address, Date.now())) reject(409, "Existe um cadastro em confirmação para este email. Use outro endereço ou aguarde a expiração.");
    }
    db.prepare("UPDATE users SET name=?,email=? WHERE id=?").run(name, address, targetId);
    db.prepare("INSERT INTO user_access(user_id,role) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET role=excluded.role").run(targetId, input.role);
    if (emailChanged) {
      db.prepare("DELETE FROM verified_emails WHERE user_id=?").run(targetId);
      db.prepare("DELETE FROM email_verifications WHERE user_id=?").run(targetId);
      db.prepare("DELETE FROM pending_registrations WHERE email IN (?,?)").run(target.email, address);
    }
    if (emailChanged || roleChanged) {
      db.prepare("DELETE FROM user_sessions WHERE user_id=?").run(targetId);
      db.prepare("DELETE FROM password_resets WHERE user_id=?").run(targetId);
      db.prepare("DELETE FROM mfa_challenges WHERE user_id=?").run(targetId);
    }
    recordAudit(db, actor, targetId, "account.edited", { nameChanged: name !== target.name, emailChanged, previousRole: target.role, role: input.role });
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return { message: "Conta atualizada com sucesso.", requiresLogin: targetId === actor.id && emailChanged, sessionsRevoked: emailChanged || roleChanged };
}

function deleteAccount(db, actor, input) {
  const targetId = field(input.userId, "Usuário", 36);
  const confirmation = email(input.confirmationEmail);
  db.exec("BEGIN IMMEDIATE");
  try {
    // Recheck access inside the transaction: the request body is read asynchronously.
    if (!db.prepare("SELECT u.id FROM users u JOIN user_access a ON a.user_id=u.id WHERE u.id=? AND a.role='admin'").get(actor.id))
      reject(403, "Acesso restrito à administração.");
    const target = db.prepare("SELECT u.id,u.email,COALESCE(a.role,'usuario') AS role FROM users u LEFT JOIN user_access a ON a.user_id=u.id WHERE u.id=?").get(targetId);
    if (!target) reject(404, "Conta não encontrada. Ela pode já ter sido excluída.");
    if (targetId === actor.id) reject(400, "Você não pode excluir a própria conta de administrador.");
    if (target.role === "admin" && db.prepare("SELECT COUNT(*) AS n FROM users u JOIN user_access a ON a.user_id=u.id WHERE a.role='admin'").get().n <= 1)
      reject(400, "O sistema precisa manter pelo menos um administrador.");
    if (confirmation !== target.email) reject(400, "Digite o email da conta que deseja excluir para confirmar.");

    db.prepare("DELETE FROM request_reads WHERE user_id=?").run(targetId);
    db.prepare("DELETE FROM client_requests WHERE user_id=?").run(targetId);
    db.prepare("DELETE FROM client_services WHERE user_id=?").run(targetId);
    // Delete the owned reports too; removing only ownership would restore bearer-token access.
    // Evidence, action progress and ownership records cascade from assessments.
    db.prepare("DELETE FROM assessments WHERE id IN (SELECT assessment_id FROM assessment_owners WHERE user_id=?)").run(targetId);
    db.prepare("DELETE FROM pending_registrations WHERE email=?").run(target.email);
    // Sessions, reset tokens, role and email verification cascade from users.
    db.prepare("DELETE FROM users WHERE id=?").run(targetId);
    recordAudit(db, actor, targetId, "account.deleted", { role: target.role });
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

export async function portalMutation(request, { params }) {
  const { action } = await params;
  if (!request.headers.get("origin")) reject(403, "Origem não permitida.");
  guard(request, "portal-write", 60);
  const admin = ["acesso", "resposta", "servico", "excluir-conta", "editar-conta", "reenviar-contato"].includes(action);
  const user = access(request, admin), input = await body(request), db = portalDatabase();
  if (admin) requireAdmin(requireUser(request));
  if (action === "acao") {
    const row = db.prepare("SELECT a.report FROM assessments a JOIN assessment_owners o ON o.assessment_id=a.id WHERE a.id=? AND o.user_id=?").get(field(input.assessmentId, "Avaliação", 36), user.id);
    if (!row) reject(404, "Avaliação não encontrada.");
    if (!JSON.parse(row.report).actions.some(item => item.id === input.actionId)) reject(400, "Ação não encontrada nesta avaliação.");
    if (!["pendente", "andamento", "concluida"].includes(input.status)) reject(400, "Status inválido.");
    db.prepare(`INSERT INTO action_progress(assessment_id,action_id,assignee,due_date,status) VALUES(?,?,?,?,?)
      ON CONFLICT(assessment_id,action_id) DO UPDATE SET assignee=excluded.assignee,due_date=excluded.due_date,status=excluded.status`)
      .run(input.assessmentId, input.actionId, field(input.assignee, "Responsável", 120, false), date(input.dueDate), input.status);
  } else if (action === "solicitacao") {
    const now = Date.now();
    guard(request, `portal-request:${user.id}`, 10, 3_600_000);
    db.prepare("INSERT INTO client_requests(id,user_id,subject,message,created_at,updated_at) VALUES(?,?,?,?,?,?)")
      .run(randomUUID(), user.id, field(input.subject, "Assunto", 160), field(input.message, "Mensagem", 5000, true, true), now, now);
  } else if (action === "leitura") {
    const id = field(input.id, "Solicitação", 36), version = field(input.version, "Versão da resposta", 64);
    if (!/^[a-f0-9]{64}$/.test(version)) reject(400, "Versão da resposta inválida.");
    const row = db.prepare("SELECT reply,updated_at FROM client_requests WHERE id=? AND user_id=?").get(id, user.id);
    if (!row) reject(404, "Solicitação não encontrada.");
    if (!row.reply || version !== replyVersion(row)) reject(409, "A solicitação foi atualizada. Recarregue para ler a resposta mais recente.");
    if (!db.prepare(`INSERT INTO request_reads(request_id,user_id,reply_hash,read_at)
      SELECT r.id,r.user_id,?,? FROM client_requests r WHERE r.id=? AND r.user_id=? AND r.reply=? AND r.updated_at=?
      ON CONFLICT(request_id) DO UPDATE SET reply_hash=excluded.reply_hash,read_at=excluded.read_at`)
      .run(version, Date.now(), id, user.id, row.reply, row.updated_at).changes)
      reject(409, "A solicitação foi atualizada. Recarregue para ler a resposta mais recente.");
  } else if (action === "acesso") {
    if (!["usuario", "cliente"].includes(input.role)) reject(400, "Perfil inválido.");
    const target = field(input.userId, "Usuário", 36);
    const existing = db.prepare("SELECT u.id,COALESCE(a.role,'usuario') AS role FROM users u LEFT JOIN user_access a ON a.user_id=u.id WHERE u.id=?").get(target);
    if (!existing) reject(404, "Usuário não encontrado.");
    if (existing.role === "admin" || target === user.id) reject(400, "Administradores são gerenciados pelo operador do servidor.");
    db.exec("BEGIN IMMEDIATE");
    try {
      if (existing.role !== input.role) {
        db.prepare("INSERT INTO user_access(user_id,role) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET role=excluded.role").run(target, input.role);
        for (const table of ["user_sessions", "password_resets", "mfa_challenges", "mfa_enrollments"]) db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(target);
        recordAudit(db, user, target, "account.role_changed", { previousRole: existing.role, role: input.role });
      }
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  } else if (action === "reenviar-contato") {
    guard(request, `contact-retry:${user.id}`, 10, 3_600_000);
    deliveryDatabase();
    const reference = field(input.reference, "Ticket", 32);
    db.exec("BEGIN IMMEDIATE");
    try {
      if (!db.prepare("UPDATE contact_delivery_jobs SET status='pending',attempts=0,next_attempt_at=?,locked_until=0,last_error_code=NULL WHERE reference=? AND status='failed'").run(Date.now(), reference).changes) reject(409, "Este contato não está com tentativas esgotadas. Atualize a página.");
      recordAudit(db, user, reference, "contact.retry_requested");
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    return json({ message: "Novo envio programado. Acompanhe o histórico de emails." });
  } else if (action === "editar-conta") {
    return json(editAccount(db, user, input));
  } else if (action === "excluir-conta") {
    deleteAccount(db, user, input);
    return json({ message: "Conta excluída com sucesso." });
  } else if (action === "resposta") {
    if (!["aberta", "andamento", "concluida"].includes(input.status)) reject(400, "Status inválido.");
    if (!db.prepare("UPDATE client_requests SET reply=?,status=?,updated_at=? WHERE id=?")
      .run(field(input.reply, "Resposta", 5000, true, true), input.status, Date.now(), field(input.id, "Solicitação", 36)).changes) reject(404, "Solicitação não encontrada.");
  } else if (action === "servico") {
    const target = field(input.userId, "Cliente", 36);
    if (!db.prepare("SELECT user_id FROM user_access WHERE user_id=? AND role='cliente'").get(target)) reject(400, "Selecione um cliente ativo.");
    if (!["planejado", "andamento", "concluido"].includes(input.status)) reject(400, "Status inválido.");
    const values = [field(input.title, "Serviço", 160), field(input.description, "Descrição", 3000, true, true), input.status, date(input.dueDate), Date.now()];
    if (input.id) {
      if (!db.prepare("UPDATE client_services SET title=?,description=?,status=?,due_date=?,updated_at=? WHERE id=? AND user_id=?").run(...values, field(input.id, "Serviço", 36), target).changes) reject(404, "Serviço não encontrado.");
    } else db.prepare("INSERT INTO client_services(title,description,status,due_date,updated_at,id,user_id) VALUES(?,?,?,?,?,?,?)").run(...values, randomUUID(), target);
  } else reject(404, "Recurso não encontrado.");
  return json({ message: action === "leitura" ? "Resposta marcada como lida." : "Alterações salvas." });
}
