import type { LucideIcon } from "lucide-react";

type ComingSoonPanelProps = {
  title: string;
  icon: LucideIcon;
};

export function ComingSoonPanel({ title, icon: Icon }: ComingSoonPanelProps) {
  return (
    <section className="panel coming">
      <div className="coming-icon">
        <Icon size={28} />
      </div>
      <h3>{title} — siguiente etapa</h3>
      <p>
        La estructura inicial está preparada. Implementaremos este módulo después de validar que la
        aplicación local funciona correctamente.
      </p>
    </section>
  );
}