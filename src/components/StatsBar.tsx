interface Props {
  total: number;
  currentlyIn: number;
}

export default function StatsBar({ total, currentlyIn }: Props) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "5px 10px", borderRadius: 10,
      background: "#0B1340", border: "1px solid rgba(99,102,241,0.2)",
      fontSize: 12, flexShrink: 0,
    }}>
      {/* employee count */}
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ color: "#FFD700", fontWeight: 700 }}>{total}</span>
        {/* hide label on very small screens */}
        <span className="sb-label" style={{ color: "#3D4A8A" }}>emp</span>
      </span>

      <div style={{ width: 1, height: 13, background: "rgba(99,102,241,0.25)", flexShrink: 0 }} />

      {/* currently in */}
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: "#4ADE80", boxShadow: "0 0 6px #4ADE80",
          display: "inline-block", flexShrink: 0,
        }} />
        <span style={{ color: "#4ADE80", fontWeight: 700 }}>{currentlyIn}</span>
        <span className="sb-label" style={{ color: "#3D4A8A" }}>in office</span>
      </span>

      <style>{`
        @media (max-width: 480px) {
          .sb-label { display: none; }
        }
      `}</style>
    </div>
  );
}