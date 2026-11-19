import mysql from "mysql2/promise";
const globalForDb=globalThis as unknown as {pool?:mysql.Pool};
export function db(){if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is not configured");if(!globalForDb.pool){const u=new URL(process.env.DATABASE_URL);globalForDb.pool=mysql.createPool({host:u.hostname,port:Number(u.port||4000),user:decodeURIComponent(u.username),password:decodeURIComponent(u.password),database:u.pathname.replace(/^\\//,""),waitForConnections:true,connectionLimit:8,queueLimit:0,ssl:{rejectUnauthorized:true}});}return globalForDb.pool;}
