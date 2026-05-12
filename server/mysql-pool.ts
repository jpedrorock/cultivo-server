/**
 * Pool MySQL compartilhado para queries raw (fora do Drizzle ORM).
 * Usado pelos routers Tuya e pelo tuyaPoller para evitar abrir
 * uma nova conexão TCP a cada chamada.
 */
import mysql from "mysql2/promise";

let _pool: mysql.Pool | null = null;

export function getMysqlPool(): mysql.Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL não definido");
    _pool = mysql.createPool({
      uri: connectionString,
      waitForConnections: true,
      connectionLimit: 10,
      idleTimeout: 60_000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 30_000,
    });
    console.log("[MySQLPool] Pool raw inicializado");
  }
  return _pool;
}

/**
 * Fecha o pool raw — chamado no shutdown gracioso (SIGTERM/SIGINT).
 */
export async function closeMysqlPool(): Promise<void> {
  if (_pool) {
    try {
      await _pool.end();
      console.log("[MySQLPool] Pool raw fechado");
    } catch (err: any) {
      console.warn("[MySQLPool] Erro ao fechar pool:", err?.message);
    }
    _pool = null;
  }
}
