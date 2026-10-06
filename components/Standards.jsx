export default function Standards({ variant = "light" }) {
  return (
    <section className={`standards standards--${variant}`} aria-label="Referenciais técnicos">
      <div className="shell standards__inner">
        <p>Referenciais técnicos</p>
        <div className="standards__list" aria-label="LGPD, ISO 27001, ISO 27701, ISO 42001, NIST, CIS Controls e PCI DSS">
          <span>LGPD</span>
          <i />
          <span>ISO 27001</span>
          <i />
          <span>ISO 27701</span>
          <i />
          <span>ISO 42001</span>
          <i />
          <span>NIST</span>
          <i />
          <span>CIS Controls</span>
          <i />
          <span>PCI DSS</span>
        </div>
      </div>
    </section>
  );
}
