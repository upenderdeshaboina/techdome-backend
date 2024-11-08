const sqlite3=require('sqlite3')
const {open}=require('sqlite')
const initializingDBandServer=async()=>{
    const db=await open({
        filename: './loan-app.db',
        driver:sqlite3.Database
    })

    await db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password TEXT,
                role TEXT
            );

            CREATE TABLE IF NOT EXISTS loans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                amount REAL,
                term TEXT,
                customer_id INTEGER,
                status TEXT,
                FOREIGN KEY (customer_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS repayments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                loan_id INTEGER,
                user_id INTEGER,
                amount REAL,
                due_date TEXT,
                status TEXT,
                FOREIGN KEY (loan_id) REFERENCES loans(id)
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        `)

        // await db.run(`drop table repayments`)
        
        return db
}
module.exports=initializingDBandServer;