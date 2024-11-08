require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const initializingDBandServer = require('./db');
const { authenticateToken, authorizeAdmin } = require('./auth');

const app = express();
app.use(cors());
app.use(bodyParser.json());

let db;
initializingDBandServer().then((database) => {
    db = database;
});

// Register user or admin
app.post('/register', async (req, res) => {
    const { username, password, role } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.run(`INSERT INTO users(username, password, role) VALUES(?, ?, ?)`, [username, hashedPassword, role]);
        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT') {
            res.status(400).json({ error: 'Username already exists' });
        } else {
            res.status(500).json({ error: 'Registration failed' });
        }
    }
});

app.get('/user',authenticateToken,async(req,res)=>{
    const {id}=req.user
    const query='select * from users where id =?'
    try {
        const response=await db.get(query,[id])
        res.status(200)
        res.send(response)
    } catch (error) {
        res.status(400)
        res.send(error.message)
    }
})

// Login user or admin
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
        if (!user) return res.status(400).json({ error: 'User not found' });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).json({ error: 'Invalid password' });

        const token = jwt.sign({ id: user.id, role: user.role }, process.env.ACCESS_TOKEN);
        res.json({ token });
    } catch (error) {
        res.status(400)
        res.send(error.message)
    }
});

// creating loan
app.post('/loans', authenticateToken, async (req, res) => {
    const { amount, term } = req.body;
    const customer_id = req.user.id;
    let weeks;
    switch(term) {
        case 'small':
            weeks = 2;  
            break;
        case 'medium':
            weeks = 3;  
            break;
        case 'long':
            weeks = 5;  
            break;
        default:
            return res.status(400).json({ error: 'Invalid term type' });
    }

    if (amount <= 0) {
        return res.status(400).json({ error: 'Amount must be positive' });
    }

    try {
        const result = await db.run(
            `INSERT INTO loans (amount, term, customer_id, status) VALUES (?, ?, ?, 'PENDING')`,
            [amount, weeks, customer_id]
        );
        const loanId = result.lastID;

        // calculated and diving into weekly payments
        const weeklyAmount = (amount / weeks).toFixed(2);
        for (let i = 0; i < weeks; i++) {
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + (i + 1) * 7); // Weekly interval
            await db.run(
                `INSERT INTO repayments (loan_id, amount, due_date, status,user_id) VALUES (?, ?, ?, 'PENDING',?)`,
                [loanId, weeklyAmount, dueDate.toISOString().split('T')[0],customer_id]
            );
        }

        res.status(201).json({ message: 'Loan created with scheduled repayments.' });
    } catch (error) {
        res.status(500).json({ error: 'Loan creation failed' });
    }
});


// view customer loans
app.get('/loans', authenticateToken, async (req, res) => {
    const customer_id = req.user.id;
    const loans = await db.all(`SELECT * FROM loans WHERE customer_id = ?`, [customer_id]);
    res.json(loans);
});

// View all Loans only admins can view 
app.get('/loans/all', authenticateToken, authorizeAdmin, async (req, res) => {
    const loans = await db.all(`SELECT * FROM loans`);
    res.json(loans);
});

// only admins can approve loans
app.patch('/loans/:id/approve', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    await db.run(`UPDATE loans SET status = 'APPROVED' WHERE id = ?`, [id]);
    res.json({ message: 'Loan approved successfully' });
});

/// only admins can reject loans
app.patch('/loans/:id/reject', authenticateToken, authorizeAdmin, async (req, res) => {
    const { id } = req.params;
    await db.run(`UPDATE loans SET status = 'REJECTED' WHERE id = ?`, [id]);
    res.json({ message: 'Loan rejected successfully' });
});

// add repayment method
app.post('/repayments/:id', authenticateToken, async (req, res) => {
    const {id}=req.params
    const { amount } = req.body;
    const repayment = await db.get(`SELECT * FROM repayments WHERE id = ? AND status = 'PENDING'`, [id]);
  
    if (!repayment) return res.status(400).json({ error: 'Repayment not found or already paid' });
    if (amount < repayment.amount) return res.status(400).json({ error: 'Repayment amount is too low' });
  
    await db.run(`UPDATE repayments SET status = 'PAID' WHERE id = ?`, [id]);
  
    const remainingRepayments = await db.all(`SELECT * FROM repayments WHERE loan_id = ? AND status = 'PENDING'`, [repayment.loan_id]);
    if (remainingRepayments.length === 0) {
      await db.run(`UPDATE loans SET status = 'PAID' WHERE id = ?`, [repayment.loan_id]);
    }
  
    res.json({ message: 'Repayment successful.' });
});

// repayments for a Loan based on the customer
app.get('/repayments', authenticateToken, async (req, res) => {
    const { id } = req.user;
    const repayments = await db.all(`SELECT * FROM repayments WHERE user_id = ?`, [id]);
    res.json(repayments);
});

const PORT=process.env.PORT || 3050
app.listen(PORT,()=>{
    console.log(`server running on port ${PORT}`)
})