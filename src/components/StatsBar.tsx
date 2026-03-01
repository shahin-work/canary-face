interface Props {
  total: number;
  currentlyIn: number;
}

export default function StatsBar({ total, currentlyIn }: Props) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "6px 14px", borderRadius: 10,
      background: "#0B1340", border: "1px solid rgba(99,102,241,0.2)",
      fontSize: 12,
    }}>
      <span style={{ color: "#3D4A8A" }}>
        <span style={{ color: "#FFD700", fontWeight: 700 }}>{total}</span> employees
      </span>
      <div style={{ width: 1, height: 14, background: "rgba(99,102,241,0.25)" }} />
      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{
          width: 7, height: 7, borderRadius: "50%", background: "#4ADE80",
          boxShadow: "0 0 6px #4ADE80", display: "inline-block",
        }} />
        <span style={{ color: "#4ADE80", fontWeight: 700 }}>{currentlyIn}</span>
        <span style={{ color: "#3D4A8A" }}>in office</span>
      </span>
    </div>
  );
}