import { ChevronLeft, ChevronRight } from "lucide-react";

type TablePaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  from: number;
  to: number;
  onPageChange: (page: number) => void;
};

export function TablePagination({
  page,
  totalPages,
  total,
  from,
  to,
  onPageChange,
}: TablePaginationProps) {
  if (total <= 0 || totalPages <= 1) return null;

  return (
    <div className="table-pagination">
      <span className="table-pagination-meta">
        Mostrando {from}–{to} de {total}
      </span>
      <div className="table-pagination-controls">
        <button
          type="button"
          className="secondary-button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft size={16} />
          Anterior
        </button>
        <span className="table-pagination-page">
          Página {page} / {totalPages}
        </span>
        <button
          type="button"
          className="secondary-button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Página siguiente"
        >
          Siguiente
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}