import { Users } from "lucide-react";

type EmptyProps = { text: string };

export function Empty({ text }: EmptyProps) {
  return (
    <div className="empty">
      <div className="empty-mark">
        <Users size={22} />
      </div>
      <p>{text}</p>
    </div>
  );
}