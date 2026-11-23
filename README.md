# GymAdmin (local + PostgreSQL)

Panel local para socios, membresías, pagos, ventas, asistencia y reportes.

## Arranque

```powershell
npm run install:all
copy server\.env.example server\.env
# Edita server\.env con tu base de datos
npm run dev
```

Abre la URL que muestra Vite (normalmente http://localhost:5173). La API escucha en el puerto `API_PORT` de `.env` (3001).

## Respaldo de datos

Ver [docs/RESPALDOS-Y-REPO.md](docs/RESPALDOS-Y-REPO.md).

```powershell
npm run db:backup
npm run db:restore -- backups/gym-AAAA-MM-DD-HHMM.dump
```

## Git

`server/.env` y la carpeta `backups/` no se versionan.