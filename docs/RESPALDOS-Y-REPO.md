# Respaldo de base de datos y repositorio

## Scripts npm

Desde la carpeta raíz del proyecto (`Gym`):

| Comando | Cuándo usarlo |
|--------|----------------|
| `npm run db:backup` | **Antes** de pasar a datos reales, **cada día** al cerrar (o cada mañana), y **antes** de actualizar código o probar cambios arriesgados. |
| `npm run db:restore -- backups/nombre.dump` | Solo si algo salió mal: vuelves al estado del archivo `.dump`. **Para el servidor** (`Ctrl+C` en `npm run dev`) antes de restaurar. |

Los archivos se guardan en `backups/` (no se suben a git).

### Requisito

`pg_dump` y `pg_restore` deben estar en el PATH de Windows (instalación de PostgreSQL). Ejemplo:

`C:\Program Files\PostgreSQL\16\bin`

### Ejemplo

```powershell
cd C:\Users\dusti\Desktop\Dustin\Gym
npm run db:backup
# → backups\gym-2026-11-23-0715.dump

npm run db:restore -- backups/gym-2026-11-23-0715.dump
```

## Repositorio (código)

- El código vive en git; los **datos del gym** viven solo en PostgreSQL.
- `server/.env` **no** se sube (contraseña de la BD).
- Copia `server/.env.example` a `server/.env` en cada PC nueva.

### Subir cambios

```powershell
git status
git add -A
git commit -m "Describe el cambio"
git push
```

## Checklist rápido antes de producción

1. `npm run db:backup` (guarda copia de prueba por si acaso).
2. Comprobar `http://127.0.0.1:3001/api/health`.
3. Recorrer usuarios → membresía → pago → asistencia → ventas → reportes.
4. Otro `npm run db:backup` con el primer dato real.