"use client";

import { useEffect, useState } from "react";

export function useRemoteData(url, query = false) {
  const [state, setState] = useState({ data: null, error: "" });
  useEffect(() => {
    let active = true, controller;
    async function load() {
      controller?.abort(); controller = new AbortController();
      try {
        const response = await fetch(url + (query ? window.location.search : ""), { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!active) return;
        if (response.status === 401 || (response.ok && data.user === null)) { window.location.replace("/login"); return; }
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar os dados.");
        setState({ data, error: "" });
      } catch (error) {
        if (active && error.name !== "AbortError") setState(current => ({ ...current, error: error.message }));
      }
    }
    load(); window.addEventListener("portfolio:refresh", load);
    return () => { active = false; controller?.abort(); window.removeEventListener("portfolio:refresh", load); };
  }, [url, query]);
  return state;
}

export function RemoteStatus({ error }) {
  return <main id="conteudo" className="section"><div className="shell narrow"><p role={error ? "alert" : "status"}>{error || "Carregando sua conta…"}</p>{error && <><a href="/minha-conta/configuracoes">Conferir configurações e segurança</a><p><a href="/login">Entrar novamente</a></p></>}</div></main>;
}
