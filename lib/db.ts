import mysql from "mysql2/promise";
const globalForDb=globalThis as unknown as {pool?:mysql.Pool};
export function db(){const {DB_HOST,DB_USER,DB_PASSWORD,DB_NAME}=process.env;if(!DB_HOST||!DB_USER||!DB_PASSWORD||!DB_NAME)throw new Error("Database environment variables are incomplete");if(!globalForDb.pool){globalForDb.pool=mysql.createPool({host:DB_HOST,port:Number(process.env.DB_PORT||4000),user:DB_USER,password:DB_PASSWORD,database:DB_NAME,waitForConnections:true,connectionLimit:8,queueLimit:0,ssl:{rejectUnauthorized:true}});}return globalForDb.pool;}
