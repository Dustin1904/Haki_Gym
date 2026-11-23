type StatProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: string;
};

export function Stat({ icon, label, value, tone }: StatProps) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}