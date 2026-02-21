(function () {

  window.DB_CHEATSHEETS = [

    // ═══════════════════════════════════════════════════
    // SQL TOPICS
    // ═══════════════════════════════════════════════════

    {
      id: 'sql_ddl',
      name: 'DDL — Create / Alter / Drop',
      emoji: '🏗️',
      category: 'SQL',
      topics: [
        {
          title: 'CREATE TABLE with constraints',
          description: 'Define a table with primary key, NOT NULL, UNIQUE, DEFAULT, and CHECK constraints.',
          code: `-- Basic table creation
CREATE TABLE users (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT    NOT NULL UNIQUE,
  email    TEXT    NOT NULL,
  age      INTEGER CHECK (age >= 0),
  role     TEXT    DEFAULT 'user',
  created  TEXT    DEFAULT CURRENT_TIMESTAMP
);

-- Table with foreign key
CREATE TABLE posts (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title   TEXT    NOT NULL,
  body    TEXT
);`
        },
        {
          title: 'ALTER TABLE',
          description: 'Add or rename columns (SQLite supports ADD COLUMN).',
          code: `-- Add a new column
ALTER TABLE users ADD COLUMN bio TEXT;

-- In MySQL/PostgreSQL you can rename columns:
-- ALTER TABLE users RENAME COLUMN username TO handle;

-- Add a column with a default value
ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1;`
        },
        {
          title: 'DROP / TRUNCATE',
          description: 'Remove tables or clear all rows.',
          code: `-- Remove the table entirely (irreversible)
DROP TABLE IF EXISTS posts;

-- Remove all rows but keep table structure
-- (DELETE without WHERE in SQLite)
DELETE FROM users;

-- In MySQL/PostgreSQL:
-- TRUNCATE TABLE users;

-- Drop multiple tables
DROP TABLE IF EXISTS posts, comments, likes;`
        },
        {
          title: 'CREATE INDEX',
          description: 'Speed up queries on frequently filtered/sorted columns.',
          code: `-- Simple index
CREATE INDEX idx_users_email ON users(email);

-- Unique index (enforces uniqueness)
CREATE UNIQUE INDEX idx_users_username ON users(username);

-- Composite index (for multi-column WHERE)
CREATE INDEX idx_posts_user_created ON posts(user_id, created);

-- View index usage
EXPLAIN QUERY PLAN SELECT * FROM users WHERE email = 'a@b.com';`
        }
      ]
    },

    {
      id: 'sql_dml',
      name: 'DML — Insert / Update / Delete',
      emoji: '✏️',
      category: 'SQL',
      topics: [
        {
          title: 'INSERT',
          description: 'Add one or multiple rows to a table.',
          code: `-- Insert a single row
INSERT INTO users (username, email, age)
VALUES ('alice', 'alice@example.com', 30);

-- Insert multiple rows at once
INSERT INTO users (username, email, age) VALUES
  ('bob',   'bob@example.com',   25),
  ('carol', 'carol@example.com', 28),
  ('dave',  'dave@example.com',  35);

-- Insert from a SELECT (copy rows)
INSERT INTO archived_users (username, email)
SELECT username, email FROM users WHERE age > 60;

-- Insert or ignore duplicates (SQLite)
INSERT OR IGNORE INTO users (username, email) VALUES ('alice', 'alice@example.com');`
        },
        {
          title: 'UPDATE',
          description: 'Modify existing rows. Always use WHERE to avoid updating every row.',
          code: `-- Update a single column
UPDATE users SET role = 'admin' WHERE username = 'alice';

-- Update multiple columns
UPDATE users
SET email = 'newalice@example.com', age = 31
WHERE id = 1;

-- Update with math
UPDATE products SET price = price * 1.10 WHERE category = 'electronics';

-- Conditional update (CASE)
UPDATE users
SET role = CASE
  WHEN age >= 18 THEN 'adult'
  ELSE 'minor'
END;`
        },
        {
          title: 'DELETE',
          description: 'Remove rows. Without WHERE it deletes all rows.',
          code: `-- Delete a specific row
DELETE FROM users WHERE id = 5;

-- Delete based on a condition
DELETE FROM posts WHERE created < '2020-01-01';

-- Delete using a subquery
DELETE FROM users
WHERE id NOT IN (SELECT DISTINCT user_id FROM posts);

-- Delete all rows (keep table)
DELETE FROM temp_logs;`
        },
        {
          title: 'UPSERT (INSERT OR REPLACE)',
          description: 'Insert if not exists, otherwise update.',
          code: `-- SQLite: INSERT OR REPLACE
INSERT OR REPLACE INTO users (id, username, email)
VALUES (1, 'alice_updated', 'alice_new@example.com');

-- SQLite: INSERT OR IGNORE (skip if duplicate)
INSERT OR IGNORE INTO users (username, email)
VALUES ('alice', 'alice@example.com');

-- PostgreSQL / MySQL style:
-- INSERT INTO users (username, email)
-- VALUES ('alice', 'alice@example.com')
-- ON CONFLICT (username) DO UPDATE SET email = EXCLUDED.email;`
        }
      ]
    },

    {
      id: 'sql_select',
      name: 'SELECT & Filtering',
      emoji: '🔍',
      category: 'SQL',
      topics: [
        {
          title: 'Basic SELECT patterns',
          description: 'SELECT, WHERE, ORDER BY, LIMIT, OFFSET, DISTINCT.',
          code: `-- Select all columns
SELECT * FROM users;

-- Select specific columns
SELECT id, username, email FROM users;

-- Filter with WHERE
SELECT * FROM users WHERE age >= 18 AND role = 'user';

-- OR condition
SELECT * FROM users WHERE role = 'admin' OR age > 50;

-- BETWEEN (inclusive)
SELECT * FROM users WHERE age BETWEEN 20 AND 30;

-- IN list
SELECT * FROM users WHERE role IN ('admin', 'moderator');

-- LIKE pattern matching (% = any chars, _ = one char)
SELECT * FROM users WHERE username LIKE 'a%';
SELECT * FROM users WHERE email LIKE '%@gmail.com';

-- IS NULL / IS NOT NULL
SELECT * FROM users WHERE bio IS NULL;

-- DISTINCT rows
SELECT DISTINCT role FROM users;

-- Sort results
SELECT * FROM users ORDER BY age DESC, username ASC;

-- Limit + Offset (pagination)
SELECT * FROM users ORDER BY id LIMIT 10 OFFSET 20;  -- page 3`
        },
        {
          title: 'Column aliases & expressions',
          description: 'Rename columns and compute derived values.',
          code: `-- Column alias with AS
SELECT username AS name, email AS contact FROM users;

-- Computed column
SELECT username, age, age * 12 AS age_months FROM users;

-- Concatenation
SELECT username || '@' || 'company.com' AS work_email FROM users;

-- CASE expression
SELECT username,
  CASE
    WHEN age < 18 THEN 'Minor'
    WHEN age < 65 THEN 'Adult'
    ELSE 'Senior'
  END AS age_group
FROM users;

-- COALESCE: first non-null value
SELECT username, COALESCE(bio, 'No bio provided') AS bio FROM users;`
        },
        {
          title: 'Subqueries',
          description: 'Use SELECT inside WHERE, FROM, or HAVING.',
          code: `-- Subquery in WHERE
SELECT * FROM users
WHERE id IN (SELECT DISTINCT user_id FROM posts);

-- Correlated subquery (per-row)
SELECT username,
  (SELECT COUNT(*) FROM posts WHERE posts.user_id = users.id) AS post_count
FROM users;

-- Subquery in FROM (derived table)
SELECT avg_age FROM (
  SELECT AVG(age) AS avg_age FROM users
) AS stats;

-- EXISTS
SELECT * FROM users u
WHERE EXISTS (
  SELECT 1 FROM posts p WHERE p.user_id = u.id
);

-- NOT EXISTS
SELECT * FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM posts p WHERE p.user_id = u.id
);`
        }
      ]
    },

    {
      id: 'sql_joins',
      name: 'JOINs',
      emoji: '🔗',
      category: 'SQL',
      topics: [
        {
          title: 'INNER JOIN',
          description: 'Returns rows that have matching values in both tables.',
          code: `-- Basic INNER JOIN
SELECT u.username, p.title
FROM users u
INNER JOIN posts p ON p.user_id = u.id;

-- Multiple JOINs
SELECT u.username, p.title, c.body AS comment
FROM users u
INNER JOIN posts p ON p.user_id = u.id
INNER JOIN comments c ON c.post_id = p.id
WHERE u.role = 'admin';

-- Self JOIN (find pairs)
SELECT a.username AS user1, b.username AS user2
FROM users a
INNER JOIN users b ON a.age = b.age AND a.id < b.id;`
        },
        {
          title: 'LEFT JOIN (outer)',
          description: 'Returns all rows from left table, NULLs for unmatched right rows.',
          code: `-- All users, even those with no posts
SELECT u.username, p.title
FROM users u
LEFT JOIN posts p ON p.user_id = u.id;

-- Find users with NO posts (anti-join)
SELECT u.username
FROM users u
LEFT JOIN posts p ON p.user_id = u.id
WHERE p.id IS NULL;

-- LEFT JOIN with aggregation
SELECT u.username, COUNT(p.id) AS post_count
FROM users u
LEFT JOIN posts p ON p.user_id = u.id
GROUP BY u.id, u.username
ORDER BY post_count DESC;`
        },
        {
          title: 'CROSS JOIN & FULL OUTER JOIN',
          description: 'Cartesian product or all rows from both sides.',
          code: `-- CROSS JOIN (every combination)
SELECT u.username, r.role_name
FROM users u
CROSS JOIN roles r;

-- FULL OUTER JOIN (all rows from both sides)
-- Not supported in SQLite; emulate with UNION:
SELECT u.username, p.title
FROM users u LEFT JOIN posts p ON p.user_id = u.id
UNION
SELECT u.username, p.title
FROM posts p LEFT JOIN users u ON p.user_id = u.id;`
        }
      ]
    },

    {
      id: 'sql_aggregation',
      name: 'Aggregations & GROUP BY',
      emoji: '📊',
      category: 'SQL',
      topics: [
        {
          title: 'Aggregate functions',
          description: 'COUNT, SUM, AVG, MIN, MAX.',
          code: `-- Count all rows
SELECT COUNT(*) AS total_users FROM users;

-- Count non-null values
SELECT COUNT(bio) AS users_with_bio FROM users;

-- Count distinct values
SELECT COUNT(DISTINCT role) AS role_count FROM users;

-- Sum and average
SELECT SUM(price) AS total, AVG(price) AS avg_price FROM products;

-- Min and max
SELECT MIN(age) AS youngest, MAX(age) AS oldest FROM users;

-- All together
SELECT
  COUNT(*) AS count,
  ROUND(AVG(age), 1) AS avg_age,
  MIN(age) AS min_age,
  MAX(age) AS max_age
FROM users;`
        },
        {
          title: 'GROUP BY & HAVING',
          description: 'Group rows and filter groups.',
          code: `-- Group by one column
SELECT role, COUNT(*) AS count
FROM users
GROUP BY role;

-- Group by multiple columns
SELECT role, age, COUNT(*) AS count
FROM users
GROUP BY role, age
ORDER BY count DESC;

-- HAVING filters groups (like WHERE but after grouping)
SELECT role, COUNT(*) AS count
FROM users
GROUP BY role
HAVING COUNT(*) > 5;

-- Combined example: users per role with at least 2 posts each
SELECT u.role, COUNT(DISTINCT p.user_id) AS active_users
FROM users u
JOIN posts p ON p.user_id = u.id
GROUP BY u.role
HAVING COUNT(DISTINCT p.user_id) >= 2;`
        },
        {
          title: 'Window functions (PostgreSQL/MySQL)',
          description: 'Compute running totals, ranks, and moving averages.',
          code: `-- ROW_NUMBER: rank rows within a partition
SELECT username, age,
  ROW_NUMBER() OVER (PARTITION BY role ORDER BY age DESC) AS rank_in_role
FROM users;

-- RANK with gaps on ties
SELECT username, score,
  RANK() OVER (ORDER BY score DESC) AS rank
FROM leaderboard;

-- Running total (cumulative SUM)
SELECT date, amount,
  SUM(amount) OVER (ORDER BY date) AS running_total
FROM transactions;

-- LAG / LEAD: access previous / next row
SELECT date, amount,
  LAG(amount) OVER (ORDER BY date) AS prev_amount,
  amount - LAG(amount) OVER (ORDER BY date) AS delta
FROM transactions;`
        }
      ]
    },

    {
      id: 'sql_cte',
      name: 'CTEs & Advanced Queries',
      emoji: '🧩',
      category: 'SQL',
      topics: [
        {
          title: 'WITH (Common Table Expressions)',
          description: 'Define named temporary result sets for readability.',
          code: `-- Simple CTE
WITH active_users AS (
  SELECT * FROM users WHERE is_active = 1
)
SELECT username, email FROM active_users WHERE role = 'admin';

-- Multiple CTEs
WITH
  adult_users AS (SELECT * FROM users WHERE age >= 18),
  their_posts AS (SELECT p.* FROM posts p JOIN adult_users u ON p.user_id = u.id)
SELECT u.username, COUNT(p.id) AS posts
FROM adult_users u
LEFT JOIN their_posts p ON p.user_id = u.id
GROUP BY u.id;

-- Recursive CTE (hierarchy/tree)
WITH RECURSIVE subordinates AS (
  SELECT id, name, manager_id FROM employees WHERE id = 1
  UNION ALL
  SELECT e.id, e.name, e.manager_id
  FROM employees e
  JOIN subordinates s ON e.manager_id = s.id
)
SELECT * FROM subordinates;`
        },
        {
          title: 'UNION / INTERSECT / EXCEPT',
          description: 'Combine result sets from multiple queries.',
          code: `-- UNION: combine, remove duplicates
SELECT username FROM admins
UNION
SELECT username FROM moderators;

-- UNION ALL: combine, keep duplicates
SELECT 'admin' AS source, username FROM admins
UNION ALL
SELECT 'mod' AS source, username FROM moderators;

-- INTERSECT: rows in both results
SELECT user_id FROM post_authors
INTERSECT
SELECT user_id FROM comment_authors;

-- EXCEPT: rows in first but not second
SELECT user_id FROM all_users
EXCEPT
SELECT user_id FROM banned_users;`
        },
        {
          title: 'Practical full example',
          description: 'Create tables, insert data, query with JOIN + aggregation.',
          code: `-- Setup: run this whole block in the SQL panel
CREATE TABLE IF NOT EXISTS dept (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS emp (
  id      INTEGER PRIMARY KEY,
  name    TEXT    NOT NULL,
  dept_id INTEGER REFERENCES dept(id),
  salary  INTEGER
);

INSERT OR IGNORE INTO dept VALUES (1,'Engineering'),(2,'Marketing'),(3,'HR');
INSERT OR IGNORE INTO emp VALUES
  (1,'Alice',1,90000),(2,'Bob',1,85000),(3,'Carol',2,70000),
  (4,'Dave',2,65000),(5,'Eve',3,60000),(6,'Frank',1,95000);

-- Average salary per department
SELECT d.name AS department,
       COUNT(e.id) AS headcount,
       ROUND(AVG(e.salary)) AS avg_salary,
       MAX(e.salary) AS top_salary
FROM dept d
LEFT JOIN emp e ON e.dept_id = d.id
GROUP BY d.id, d.name
ORDER BY avg_salary DESC;`
        }
      ]
    },

    // ═══════════════════════════════════════════════════
    // MONGODB TOPICS
    // ═══════════════════════════════════════════════════

    {
      id: 'mongo_crud',
      name: 'CRUD — Basic Operations',
      emoji: '📝',
      category: 'MongoDB',
      topics: [
        {
          title: 'insertOne & insertMany',
          description: 'Add documents to a collection.',
          code: `// insertOne — add a single document
const r1 = db.collection('users').insertOne({
  name: 'Alice',
  email: 'alice@example.com',
  age: 30,
  roles: ['user'],
  address: { city: 'NYC', zip: '10001' }
});
print('Inserted ID:', r1.insertedId);

// insertMany — add multiple documents
const r2 = db.collection('users').insertMany([
  { name: 'Bob',   email: 'bob@example.com',   age: 25, roles: ['user'] },
  { name: 'Carol', email: 'carol@example.com', age: 28, roles: ['admin', 'user'] },
  { name: 'Dave',  email: 'dave@example.com',  age: 35, roles: ['user'] }
]);
print('Inserted count:', r2.insertedCount);

// Verify
const all = db.collection('users').find().toArray();
printJSON(all);`
        },
        {
          title: 'find & findOne',
          description: 'Query documents from a collection.',
          code: `// Setup
db.collection('products').insertMany([
  { name: 'Laptop',  price: 999,  category: 'electronics', stock: 50 },
  { name: 'Phone',   price: 699,  category: 'electronics', stock: 120 },
  { name: 'Desk',    price: 299,  category: 'furniture',   stock: 30 },
  { name: 'Chair',   price: 199,  category: 'furniture',   stock: 60 },
  { name: 'Monitor', price: 399,  category: 'electronics', stock: 45 }
]);

// Find all documents
const all = db.collection('products').find().toArray();
print('Total:', all.length);

// Find with a simple filter
const electronics = db.collection('products').find({ category: 'electronics' }).toArray();
print('Electronics:', electronics.length);

// findOne — returns first match or null
const laptop = db.collection('products').findOne({ name: 'Laptop' });
print('Laptop price:', laptop ? laptop.price : 'not found');

// Find and sort
const byPrice = db.collection('products').find({}).sort({ price: -1 }).toArray();
print('Most expensive:', byPrice[0].name, byPrice[0].price);

// Find with limit
const top3 = db.collection('products').find({}).sort({ price: -1 }).limit(3).toArray();
printJSON(top3);`
        },
        {
          title: 'updateOne & updateMany',
          description: 'Modify documents using update operators.',
          code: `// Setup
db.collection('inventory').insertMany([
  { item: 'paper',   qty: 100, status: 'A', tags: ['plain'] },
  { item: 'planner', qty: 75,  status: 'D', tags: ['business'] },
  { item: 'binder',  qty: 80,  status: 'A', tags: ['office'] }
]);

// $set — set or add fields
const r1 = db.collection('inventory').updateOne(
  { item: 'paper' },
  { $set: { status: 'B', lastUpdated: '2024-01-01' } }
);
print('Modified:', r1.modifiedCount);

// $inc — increment a field
db.collection('inventory').updateOne(
  { item: 'paper' },
  { $inc: { qty: -20 } }   // reduce qty by 20
);

// $push — add to array
db.collection('inventory').updateOne(
  { item: 'planner' },
  { $push: { tags: 'personal' } }
);

// $pull — remove from array
db.collection('inventory').updateOne(
  { item: 'paper' },
  { $pull: { tags: 'plain' } }
);

// updateMany — update all matching
const r2 = db.collection('inventory').updateMany(
  { status: 'A' },
  { $set: { available: true } }
);
print('Updated many:', r2.modifiedCount);

const result = db.collection('inventory').find().toArray();
printJSON(result);`
        },
        {
          title: 'deleteOne & deleteMany',
          description: 'Remove documents from a collection.',
          code: `// Setup
db.collection('logs').insertMany([
  { level: 'info',  msg: 'Server started',  ts: '2024-01-01' },
  { level: 'warn',  msg: 'High memory',     ts: '2024-01-02' },
  { level: 'error', msg: 'DB timeout',      ts: '2024-01-03' },
  { level: 'info',  msg: 'Request handled', ts: '2024-01-04' },
  { level: 'error', msg: 'Auth failed',     ts: '2024-01-05' }
]);

// deleteOne — removes first match
const r1 = db.collection('logs').deleteOne({ level: 'info' });
print('Deleted one:', r1.deletedCount);

// deleteMany — removes all matches
const r2 = db.collection('logs').deleteMany({ level: 'error' });
print('Deleted errors:', r2.deletedCount);

// countDocuments — count remaining
const remaining = db.collection('logs').countDocuments();
print('Remaining logs:', remaining);

const all = db.collection('logs').find().toArray();
printJSON(all);`
        }
      ]
    },

    {
      id: 'mongo_query_ops',
      name: 'Query Operators',
      emoji: '🔎',
      category: 'MongoDB',
      topics: [
        {
          title: 'Comparison operators',
          description: '$eq, $ne, $gt, $gte, $lt, $lte, $in, $nin',
          code: `// Setup
db.collection('items').insertMany([
  { name: 'A', price: 10, qty: 100 },
  { name: 'B', price: 25, qty: 50  },
  { name: 'C', price: 50, qty: 20  },
  { name: 'D', price: 15, qty: 80  },
  { name: 'E', price: 99, qty: 5   }
]);

// $gt / $lt — greater/less than
const expensive = db.collection('items').find({ price: { $gt: 20 } }).toArray();
print('Price > 20:', expensive.map(i => i.name));

// $gte / $lte — greater/less than or equal
const mid = db.collection('items').find({ price: { $gte: 15, $lte: 50 } }).toArray();
print('15 <= price <= 50:', mid.map(i => i.name));

// $in — value in array
const selected = db.collection('items').find({ name: { $in: ['A', 'C', 'E'] } }).toArray();
print('Selected:', selected.map(i => i.name));

// $ne — not equal
const notA = db.collection('items').find({ name: { $ne: 'A' } }).toArray();
print('Not A:', notA.map(i => i.name));

// $nin — not in array
const notAB = db.collection('items').find({ name: { $nin: ['A', 'B'] } }).toArray();
print('Not A or B:', notAB.map(i => i.name));`
        },
        {
          title: 'Logical operators',
          description: '$and, $or, $not, $nor — combine multiple conditions.',
          code: `// Setup
db.collection('products').insertMany([
  { name: 'Laptop',  price: 999, category: 'tech',       inStock: true  },
  { name: 'Phone',   price: 599, category: 'tech',       inStock: false },
  { name: 'Book',    price: 29,  category: 'education',  inStock: true  },
  { name: 'Tablet',  price: 449, category: 'tech',       inStock: true  },
  { name: 'Course',  price: 99,  category: 'education',  inStock: true  }
]);

// $and (explicit)
const q1 = db.collection('products').find({
  $and: [{ category: 'tech' }, { inStock: true }]
}).toArray();
print('Tech and in stock:', q1.map(p => p.name));

// Implicit AND (shorthand)
const q2 = db.collection('products').find({ category: 'tech', inStock: true }).toArray();
print('Same result:', q2.map(p => p.name));

// $or
const q3 = db.collection('products').find({
  $or: [{ price: { $lt: 50 } }, { category: 'education' }]
}).toArray();
print('Cheap OR education:', q3.map(p => p.name));

// Combined $and + $or
const q4 = db.collection('products').find({
  inStock: true,
  $or: [{ price: { $lt: 100 } }, { category: 'tech' }]
}).toArray();
printJSON(q4);`
        },
        {
          title: 'Array & embedded document queries',
          description: 'Query nested fields and array elements.',
          code: `// Setup
db.collection('orders').insertMany([
  { id: 1, customer: { name: 'Alice', city: 'NYC' }, tags: ['urgent', 'vip'],    total: 500 },
  { id: 2, customer: { name: 'Bob',   city: 'LA'  }, tags: ['standard'],         total: 200 },
  { id: 3, customer: { name: 'Carol', city: 'NYC' }, tags: ['urgent', 'bulk'],   total: 1200 },
  { id: 4, customer: { name: 'Dave',  city: 'SF'  }, tags: ['vip'],              total: 800 }
]);

// Query on nested field (dot notation)
const nyc = db.collection('orders').find({ 'customer.city': 'NYC' }).toArray();
print('NYC orders:', nyc.map(o => o.customer.name));

// Query on array element (exact match anywhere in array)
const urgent = db.collection('orders').find({ tags: 'urgent' }).toArray();
print('Urgent:', urgent.map(o => o.id));

// $all — array contains ALL specified values
const urgentVip = db.collection('orders').find({ tags: { $in: ['vip'] } }).toArray();
print('Has VIP tag:', urgentVip.map(o => o.id));

// Count documents
const count = db.collection('orders').countDocuments({ 'customer.city': 'NYC' });
print('NYC count:', count);`
        }
      ]
    },

    {
      id: 'mongo_aggregation',
      name: 'Aggregation Pipeline',
      emoji: '⚙️',
      category: 'MongoDB',
      topics: [
        {
          title: '$match, $project, $sort, $limit',
          description: 'Filter, reshape, sort and limit the pipeline.',
          code: `// Setup
db.collection('sales').insertMany([
  { product: 'A', region: 'East', amount: 100, rep: 'Alice' },
  { product: 'B', region: 'West', amount: 200, rep: 'Bob'   },
  { product: 'A', region: 'East', amount: 150, rep: 'Alice' },
  { product: 'C', region: 'East', amount: 300, rep: 'Carol' },
  { product: 'B', region: 'East', amount: 120, rep: 'Alice' },
  { product: 'A', region: 'West', amount: 180, rep: 'Dave'  }
]);

const result = db.collection('sales').aggregate([
  // Stage 1: filter
  { $match: { region: 'East' } },

  // Stage 2: reshape documents (1=include, 0=exclude)
  { $project: { product: 1, amount: 1, rep: 1 } },

  // Stage 3: sort descending
  { $sort: { amount: -1 } },

  // Stage 4: limit
  { $limit: 3 }
]).toArray();

print('Top 3 East sales:');
printJSON(result);`
        },
        {
          title: '$group — aggregation',
          description: 'Group documents and compute totals, counts, averages.',
          code: `// Setup
db.collection('orders2').insertMany([
  { dept: 'Engineering', emp: 'Alice', salary: 90000 },
  { dept: 'Engineering', emp: 'Bob',   salary: 85000 },
  { dept: 'Engineering', emp: 'Frank', salary: 95000 },
  { dept: 'Marketing',   emp: 'Carol', salary: 70000 },
  { dept: 'Marketing',   emp: 'Dave',  salary: 65000 },
  { dept: 'HR',          emp: 'Eve',   salary: 60000 }
]);

const result = db.collection('orders2').aggregate([
  {
    $group: {
      _id: '$dept',
      headcount: { $sum: 1 },
      totalSalary: { $sum: '$salary' },
      avgSalary: { $avg: '$salary' },
      maxSalary: { $sum: '$salary' }   // reusing $sum for total
    }
  },
  { $sort: { totalSalary: -1 } }
]).toArray();

print('Salary by department:');
printJSON(result);`
        },
        {
          title: 'Full pipeline example',
          description: 'Multi-stage pipeline: match → group → project → sort.',
          code: `// E-commerce orders dataset
db.collection('ecom').insertMany([
  { category: 'electronics', product: 'Laptop',  price: 999, qty: 2, month: 'Jan' },
  { category: 'electronics', product: 'Phone',   price: 699, qty: 5, month: 'Jan' },
  { category: 'furniture',   product: 'Desk',    price: 299, qty: 3, month: 'Jan' },
  { category: 'electronics', product: 'Monitor', price: 399, qty: 4, month: 'Feb' },
  { category: 'furniture',   product: 'Chair',   price: 199, qty: 8, month: 'Feb' },
  { category: 'electronics', product: 'Laptop',  price: 999, qty: 1, month: 'Feb' }
]);

const report = db.collection('ecom').aggregate([
  // Only Jan data
  { $match: { month: 'Jan' } },

  // Add computed revenue field (project doesn't support arithmetic in the simulator)
  // Group by category
  { $group: {
    _id: '$category',
    totalItems: { $sum: '$qty' },
    totalRevenue: { $sum: '$price' },
    productCount: { $sum: 1 }
  }},

  // Sort by revenue
  { $sort: { totalRevenue: -1 } },

  // Rename _id for readability
  { $project: { category: 1, totalItems: 1, totalRevenue: 1, productCount: 1 } }
]).toArray();

print('Jan revenue by category:');
printJSON(report);`
        }
      ]
    },

    {
      id: 'mongo_update_ops',
      name: 'Update Operators',
      emoji: '🔧',
      category: 'MongoDB',
      topics: [
        {
          title: '$set, $unset, $inc, $rename',
          description: 'Modify specific fields without replacing the whole document.',
          code: `// Setup
db.collection('config').insertOne({
  env: 'production',
  version: 1,
  debug: true,
  deprecated_field: 'old',
  retries: 3
});

// $set — add or update fields
db.collection('config').updateOne(
  { env: 'production' },
  { $set: { version: 2, lastDeploy: '2024-06-01' } }
);

// $unset — remove a field (value doesn't matter)
db.collection('config').updateOne(
  { env: 'production' },
  { $unset: { deprecated_field: '' } }
);

// $inc — increment or decrement
db.collection('config').updateOne(
  { env: 'production' },
  { $inc: { retries: 2, version: 1 } }   // retries: 5, version: 3
);

const doc = db.collection('config').findOne({ env: 'production' });
printJSON(doc);`
        },
        {
          title: '$push, $pull, $addToSet',
          description: 'Update array fields.',
          code: `// Setup
db.collection('wishlist').insertOne({
  user: 'alice',
  items: ['laptop', 'keyboard'],
  tags: ['premium', 'tech']
});

// $push — add element to array (allows duplicates)
db.collection('wishlist').updateOne(
  { user: 'alice' },
  { $push: { items: 'mouse' } }
);

// $addToSet — add only if not already present
db.collection('wishlist').updateOne(
  { user: 'alice' },
  { $addToSet: { items: 'laptop' } }  // no duplicate added
);
db.collection('wishlist').updateOne(
  { user: 'alice' },
  { $addToSet: { tags: 'developer' } }  // 'developer' added
);

// $pull — remove element from array
db.collection('wishlist').updateOne(
  { user: 'alice' },
  { $pull: { items: 'keyboard' } }
);

const doc = db.collection('wishlist').findOne({ user: 'alice' });
printJSON(doc);`
        }
      ]
    },

    {
      id: 'mongo_indexes',
      name: 'Indexes & Performance',
      emoji: '⚡',
      category: 'MongoDB',
      topics: [
        {
          title: 'Index types and createIndex',
          description: 'Indexes speed up find() and aggregate() at the cost of write overhead.',
          code: `// In real MongoDB (not the simulator), you'd call:

// Single field index (ascending)
// db.users.createIndex({ email: 1 })

// Compound index (multi-field)
// db.posts.createIndex({ userId: 1, createdAt: -1 })

// Unique index
// db.users.createIndex({ email: 1 }, { unique: true })

// Text index (full-text search)
// db.articles.createIndex({ title: 'text', body: 'text' })

// TTL index (auto-delete after expiry)
// db.sessions.createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600 })

// Partial index (only index matching documents)
// db.orders.createIndex({ status: 1 }, { partialFilterExpression: { status: 'active' } })

// Sparse index (skip null values)
// db.users.createIndex({ phone: 1 }, { sparse: true })

// View indexes
// db.users.getIndexes()

// Drop an index
// db.users.dropIndex({ email: 1 })

// Note: The in-browser simulator doesn't support createIndex,
// but real MongoDB performance depends heavily on proper indexing.
print('Index types reference displayed above.');
print('Run these in a real MongoDB shell or MongoDB Compass.');`
        },
        {
          title: 'Query patterns that benefit from indexes',
          description: 'Understand which queries use indexes effectively.',
          code: `// Setup: simulate a users collection
db.collection('users2').insertMany([
  { name: 'Alice', email: 'alice@ex.com', age: 30, city: 'NYC', active: true  },
  { name: 'Bob',   email: 'bob@ex.com',   age: 25, city: 'LA',  active: false },
  { name: 'Carol', email: 'carol@ex.com', age: 35, city: 'NYC', active: true  },
  { name: 'Dave',  email: 'dave@ex.com',  age: 28, city: 'SF',  active: true  },
  { name: 'Eve',   email: 'eve@ex.com',   age: 22, city: 'NYC', active: false }
]);

// ✅ GOOD: Equality on indexed field → index scan
const byEmail = db.collection('users2').findOne({ email: 'alice@ex.com' });
print('Found:', byEmail.name);

// ✅ GOOD: Range query on indexed field
const ageRange = db.collection('users2').find({ age: { $gte: 25, $lte: 32 } }).toArray();
print('Age 25-32:', ageRange.map(u => u.name));

// ✅ GOOD: Sort matches index order (no in-memory sort needed)
const sorted = db.collection('users2').find({ city: 'NYC' }).sort({ age: 1 }).toArray();
print('NYC sorted by age:', sorted.map(u => u.name));

// ❌ AVOID: leading wildcard in text search (can't use index)
// db.users.find({ name: /.*alice.*/i })  → use text index instead

// ❌ AVOID: $where or JS expressions → always full collection scan
// db.users.find({ $where: 'this.age > 30' })`
        }
      ]
    }

  ];

})();
