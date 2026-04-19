/* ===================================================================
   ParadoxEditor — Interview Problem Library
   Each problem has: id, title, lang, difficulty, tags, description,
   starterCode, functionName (JS/Py), testCases, hints, solution.
   =================================================================== */

window.PARADOX_PROBLEMS = [

  // ─────────────────────────── JAVASCRIPT ──────────────────────────

  {
    id: 'js-two-sum',
    title: 'Two Sum',
    lang: 'javascript',
    difficulty: 'easy',
    tags: ['array', 'hash-map'],
    description: `Given an array \`nums\` and an integer \`target\`, return the **indices** of the two numbers that add up to \`target\`. Each input has exactly one solution.

**Example 1**
\`\`\`
Input:  nums = [2, 7, 11, 15], target = 9
Output: [0, 1]
\`\`\`

**Example 2**
\`\`\`
Input:  nums = [3, 2, 4], target = 6
Output: [1, 2]
\`\`\`

**Constraints**
- 2 ≤ nums.length ≤ 10⁴
- Answer is always unique`,
    starterCode: `function twoSum(nums, target) {
  // Your code here
}`,
    functionName: 'twoSum',
    testCases: [
      { input: [[2, 7, 11, 15], 9], expected: [0, 1], label: 'Basic' },
      { input: [[3, 2, 4], 6],      expected: [1, 2], label: 'Middle elements' },
      { input: [[3, 3], 6],         expected: [0, 1], label: 'Duplicate values' },
    ],
    hints: [
      'For each number, what is its complement (target − num)?',
      'A hash map lets you look up any complement in O(1).',
      'Build the map as you iterate — store value → index.',
    ],
    solution: `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (seen.has(complement)) return [seen.get(complement), i];
    seen.set(nums[i], i);
  }
}`,
  },

  {
    id: 'js-valid-parentheses',
    title: 'Valid Parentheses',
    lang: 'javascript',
    difficulty: 'easy',
    tags: ['stack', 'string'],
    description: `Given a string \`s\` containing only \`(\`, \`)\`, \`{\`, \`}\`, \`[\`, \`]\`, determine if the input string is **valid**.

A string is valid if:
- Open brackets are closed by the same type of bracket.
- Open brackets are closed in the correct order.

**Example 1**
\`\`\`
Input:  s = "()"
Output: true
\`\`\`

**Example 2**
\`\`\`
Input:  s = "()[]{}"
Output: true
\`\`\`

**Example 3**
\`\`\`
Input:  s = "(]"
Output: false
\`\`\``,
    starterCode: `function isValid(s) {
  // Your code here
}`,
    functionName: 'isValid',
    testCases: [
      { input: ['()'],     expected: true,  label: 'Simple pair' },
      { input: ['()[]{}'], expected: true,  label: 'All types' },
      { input: ['(]'],     expected: false, label: 'Mismatched' },
      { input: ['([)]'],   expected: false, label: 'Interleaved' },
      { input: ['{[]}'],   expected: true,  label: 'Nested' },
    ],
    hints: [
      'Use a stack — push open brackets, pop on close brackets.',
      'If the top of the stack does not match, return false immediately.',
      'At the end the stack must be empty.',
    ],
    solution: `function isValid(s) {
  const map = { ')': '(', '}': '{', ']': '[' };
  const stack = [];
  for (const ch of s) {
    if (!map[ch]) { stack.push(ch); continue; }
    if (stack.pop() !== map[ch]) return false;
  }
  return stack.length === 0;
}`,
  },

  {
    id: 'js-max-subarray',
    title: 'Maximum Subarray',
    lang: 'javascript',
    difficulty: 'medium',
    tags: ['array', 'dynamic-programming'],
    description: `Given an integer array \`nums\`, find the **contiguous subarray** that has the largest sum and return its sum.

**Example 1**
\`\`\`
Input:  nums = [-2, 1, -3, 4, -1, 2, 1, -5, 4]
Output: 6   (subarray [4, -1, 2, 1])
\`\`\`

**Example 2**
\`\`\`
Input:  nums = [1]
Output: 1
\`\`\`

**Constraints**
- 1 ≤ nums.length ≤ 10⁵
- −10⁴ ≤ nums[i] ≤ 10⁴`,
    starterCode: `function maxSubArray(nums) {
  // Your code here
}`,
    functionName: 'maxSubArray',
    testCases: [
      { input: [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], expected: 6,  label: 'Classic Kadane' },
      { input: [[1]],                               expected: 1,  label: 'Single element' },
      { input: [[5, 4, -1, 7, 8]],                 expected: 23, label: 'All positive' },
      { input: [[-1, -2, -3]],                      expected: -1, label: 'All negative' },
    ],
    hints: [
      "Kadane's algorithm: at each position decide to extend or start fresh.",
      'Keep a running sum and a global max.',
      '`current = Math.max(nums[i], current + nums[i])`',
    ],
    solution: `function maxSubArray(nums) {
  let current = nums[0], best = nums[0];
  for (let i = 1; i < nums.length; i++) {
    current = Math.max(nums[i], current + nums[i]);
    best = Math.max(best, current);
  }
  return best;
}`,
  },

  {
    id: 'js-merge-intervals',
    title: 'Merge Intervals',
    lang: 'javascript',
    difficulty: 'medium',
    tags: ['array', 'sorting'],
    description: `Given an array of intervals where \`intervals[i] = [starti, endi]\`, merge all overlapping intervals and return an array of the non-overlapping intervals.

**Example 1**
\`\`\`
Input:  intervals = [[1,3],[2,6],[8,10],[15,18]]
Output: [[1,6],[8,10],[15,18]]
\`\`\`

**Example 2**
\`\`\`
Input:  intervals = [[1,4],[4,5]]
Output: [[1,5]]
\`\`\``,
    starterCode: `function merge(intervals) {
  // Your code here
}`,
    functionName: 'merge',
    testCases: [
      { input: [[[1,3],[2,6],[8,10],[15,18]]], expected: [[1,6],[8,10],[15,18]], label: 'Standard' },
      { input: [[[1,4],[4,5]]],               expected: [[1,5]],               label: 'Touching' },
      { input: [[[1,4],[0,4]]],               expected: [[0,4]],               label: 'Unsorted' },
    ],
    hints: [
      'Sort intervals by start time first.',
      'Walk through sorted intervals; extend the last merged interval if overlapping.',
      'Two intervals overlap when `start[i] <= end[merged]`.',
    ],
    solution: `function merge(intervals) {
  intervals.sort((a, b) => a[0] - b[0]);
  const res = [intervals[0]];
  for (let i = 1; i < intervals.length; i++) {
    const last = res[res.length - 1];
    if (intervals[i][0] <= last[1]) last[1] = Math.max(last[1], intervals[i][1]);
    else res.push(intervals[i]);
  }
  return res;
}`,
  },

  {
    id: 'js-climbing-stairs',
    title: 'Climbing Stairs',
    lang: 'javascript',
    difficulty: 'easy',
    tags: ['dynamic-programming', 'math'],
    description: `You are climbing a staircase with \`n\` steps. Each time you can climb 1 or 2 steps. How many distinct ways can you reach the top?

**Example 1**
\`\`\`
Input:  n = 2
Output: 2   (1+1, 2)
\`\`\`

**Example 2**
\`\`\`
Input:  n = 3
Output: 3   (1+1+1, 1+2, 2+1)
\`\`\``,
    starterCode: `function climbStairs(n) {
  // Your code here
}`,
    functionName: 'climbStairs',
    testCases: [
      { input: [1], expected: 1,  label: '1 step' },
      { input: [2], expected: 2,  label: '2 steps' },
      { input: [3], expected: 3,  label: '3 steps' },
      { input: [5], expected: 8,  label: '5 steps' },
      { input: [10], expected: 89, label: '10 steps' },
    ],
    hints: [
      'The number of ways to reach step n equals ways(n-1) + ways(n-2).',
      'This is just the Fibonacci sequence.',
      'Avoid recursion — use two variables rolling forward.',
    ],
    solution: `function climbStairs(n) {
  let a = 1, b = 1;
  for (let i = 2; i <= n; i++) [a, b] = [b, a + b];
  return b;
}`,
  },

  {
    id: 'js-reverse-linked-list',
    title: 'Reverse Linked List',
    lang: 'javascript',
    difficulty: 'easy',
    tags: ['linked-list'],
    description: `Given the head of a singly linked list, reverse the list and return the reversed list.

For this problem, a node is represented as \`{ val, next }\`.

**Example**
\`\`\`
Input:  1 → 2 → 3 → 4 → 5
Output: 5 → 4 → 3 → 2 → 1
\`\`\`

Your function receives and should return the head node.`,
    starterCode: `// Node: { val: number, next: Node | null }
function reverseList(head) {
  // Your code here
}`,
    functionName: 'reverseList',
    testCases: [
      { input: [{ val: 1, next: { val: 2, next: { val: 3, next: null } } }], expected: { val: 3, next: { val: 2, next: { val: 1, next: null } } }, label: '3 nodes' },
      { input: [null], expected: null, label: 'Empty list' },
    ],
    hints: [
      'Use three pointers: prev, curr, next.',
      'At each step: store next, point curr.next to prev, advance both.',
      'prev becomes the new head when curr is null.',
    ],
    solution: `function reverseList(head) {
  let prev = null, curr = head;
  while (curr) {
    const next = curr.next;
    curr.next = prev;
    prev = curr;
    curr = next;
  }
  return prev;
}`,
  },

  // ─────────────────────────── PYTHON ──────────────────────────────

  {
    id: 'py-two-sum',
    title: 'Two Sum',
    lang: 'python',
    difficulty: 'easy',
    tags: ['array', 'hash-map'],
    description: `Given a list \`nums\` and an integer \`target\`, return the **indices** of the two numbers that add up to \`target\`.

**Example**
\`\`\`
Input:  nums = [2, 7, 11, 15], target = 9
Output: [0, 1]
\`\`\``,
    starterCode: `def two_sum(nums, target):
    # Your code here
    pass`,
    functionName: 'two_sum',
    testCases: [
      { input: [[2, 7, 11, 15], 9], expected: [0, 1], label: 'Basic' },
      { input: [[3, 2, 4], 6],      expected: [1, 2], label: 'Middle elements' },
      { input: [[3, 3], 6],         expected: [0, 1], label: 'Duplicates' },
    ],
    hints: [
      'Use a dictionary to store value → index.',
      'Check for the complement before inserting the current value.',
    ],
    solution: `def two_sum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return [seen[target - n], i]
        seen[n] = i`,
  },

  {
    id: 'py-palindrome',
    title: 'Valid Palindrome',
    lang: 'python',
    difficulty: 'easy',
    tags: ['string', 'two-pointers'],
    description: `A phrase is a **palindrome** if it reads the same forwards and backwards after removing all non-alphanumeric characters and converting to lowercase.

**Example 1**
\`\`\`
Input:  s = "A man, a plan, a canal: Panama"
Output: True
\`\`\`

**Example 2**
\`\`\`
Input:  s = "race a car"
Output: False
\`\`\``,
    starterCode: `def is_palindrome(s):
    # Your code here
    pass`,
    functionName: 'is_palindrome',
    testCases: [
      { input: ['A man, a plan, a canal: Panama'], expected: true, label: 'Classic' },
      { input: ['race a car'],                     expected: false, label: 'Not palindrome' },
      { input: [' '],                              expected: true,  label: 'Empty after clean' },
    ],
    hints: [
      'Strip non-alphanumeric chars and lowercase first.',
      'Two pointers from both ends — compare and converge.',
    ],
    solution: `def is_palindrome(s):
    cleaned = [c.lower() for c in s if c.isalnum()]
    return cleaned == cleaned[::-1]`,
  },

  {
    id: 'py-group-anagrams',
    title: 'Group Anagrams',
    lang: 'python',
    difficulty: 'medium',
    tags: ['array', 'hash-map', 'sorting'],
    description: `Given an array of strings \`strs\`, group the **anagrams** together.

**Example**
\`\`\`
Input:  strs = ["eat","tea","tan","ate","nat","bat"]
Output: [["bat"],["nat","tan"],["ate","eat","tea"]]
\`\`\`

Order of groups and within groups does not matter for the test.`,
    starterCode: `def group_anagrams(strs):
    # Your code here
    pass`,
    functionName: 'group_anagrams',
    testCases: [
      { input: [['eat','tea','tan','ate','nat','bat']], expected: [['bat'],['nat','tan'],['ate','eat','tea']], label: 'Standard', orderInsensitive: true },
      { input: [['']], expected: [['']], label: 'Empty string' },
      { input: [['a']], expected: [['a']], label: 'Single char' },
    ],
    hints: [
      'Two words are anagrams if sorting them produces the same string.',
      'Use a defaultdict(list) keyed by the sorted word.',
    ],
    solution: `from collections import defaultdict
def group_anagrams(strs):
    groups = defaultdict(list)
    for s in strs:
        groups[tuple(sorted(s))].append(s)
    return list(groups.values())`,
  },

  {
    id: 'py-binary-search',
    title: 'Binary Search',
    lang: 'python',
    difficulty: 'easy',
    tags: ['binary-search', 'array'],
    description: `Given a **sorted** array of integers \`nums\` and a \`target\`, return the index of the target. Return \`-1\` if not found. Must run in **O(log n)**.

**Example**
\`\`\`
Input:  nums = [-1, 0, 3, 5, 9, 12], target = 9
Output: 4
\`\`\``,
    starterCode: `def search(nums, target):
    # Your code here — must be O(log n)
    pass`,
    functionName: 'search',
    testCases: [
      { input: [[-1, 0, 3, 5, 9, 12], 9], expected: 4,  label: 'Found' },
      { input: [[-1, 0, 3, 5, 9, 12], 2], expected: -1, label: 'Not found' },
      { input: [[5], 5],                   expected: 0,  label: 'Single element' },
    ],
    hints: [
      'Maintain lo and hi pointers.',
      'Check mid = (lo + hi) // 2 each iteration.',
      'Narrow the window based on comparison with target.',
    ],
    solution: `def search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target: return mid
        elif nums[mid] < target: lo = mid + 1
        else: hi = mid - 1
    return -1`,
  },

  {
    id: 'py-longest-common-prefix',
    title: 'Longest Common Prefix',
    lang: 'python',
    difficulty: 'easy',
    tags: ['string'],
    description: `Write a function to find the longest common prefix string amongst an array of strings. If there is no common prefix, return an empty string \`""\`.

**Example 1**
\`\`\`
Input:  strs = ["flower","flow","flight"]
Output: "fl"
\`\`\`

**Example 2**
\`\`\`
Input:  strs = ["dog","racecar","car"]
Output: ""
\`\`\``,
    starterCode: `def longest_common_prefix(strs):
    # Your code here
    pass`,
    functionName: 'longest_common_prefix',
    testCases: [
      { input: [['flower','flow','flight']], expected: 'fl', label: 'Partial prefix' },
      { input: [['dog','racecar','car']],    expected: '',   label: 'No prefix' },
      { input: [['interspecies','interstellar','interstate']], expected: 'inters', label: 'Long prefix' },
    ],
    hints: [
      'Sort the list — the first and last strings will differ the most.',
      'Compare only the first and last strings character by character.',
    ],
    solution: `def longest_common_prefix(strs):
    if not strs: return ""
    strs.sort()
    first, last = strs[0], strs[-1]
    i = 0
    while i < len(first) and i < len(last) and first[i] == last[i]:
        i += 1
    return first[:i]`,
  },

  // ──────────────────────────── SQL ────────────────────────────────

  {
    id: 'sql-duplicate-emails',
    title: 'Duplicate Emails',
    lang: 'sql',
    difficulty: 'easy',
    tags: ['aggregate', 'group-by'],
    description: `Find all emails that appear **more than once** in the \`Person\` table.

**Table: Person**
| Column | Type    |
|--------|---------|
| id     | INTEGER |
| email  | TEXT    |

**Example**
\`\`\`
Input:
id | email
 1 | a@b.com
 2 | c@d.com
 3 | a@b.com

Output:
email
a@b.com
\`\`\``,
    starterCode: `-- Write your query here
SELECT email
FROM Person
-- your GROUP BY / HAVING here`,
    setupSql: `
CREATE TABLE Person (id INTEGER PRIMARY KEY, email TEXT);
INSERT INTO Person VALUES (1, 'a@b.com'), (2, 'c@d.com'), (3, 'a@b.com');`,
    testCases: [
      { expectedRows: [['a@b.com']], label: 'One duplicate' },
    ],
    hints: [
      'GROUP BY email and count occurrences.',
      'Use HAVING COUNT(*) > 1 to filter groups.',
    ],
    solution: `SELECT email FROM Person GROUP BY email HAVING COUNT(*) > 1`,
  },

  {
    id: 'sql-second-salary',
    title: 'Second Highest Salary',
    lang: 'sql',
    difficulty: 'medium',
    tags: ['subquery', 'aggregate'],
    description: `Find the **second highest** salary from the \`Employee\` table. Return \`NULL\` if there is no second highest.

**Table: Employee**
| Column | Type    |
|--------|---------|
| id     | INTEGER |
| salary | INTEGER |

**Example 1**
\`\`\`
Input: salaries = [100, 200, 300]
Output: 200
\`\`\`

**Example 2**
\`\`\`
Input: salaries = [100]
Output: NULL
\`\`\``,
    starterCode: `-- Write your query here
SELECT ??? AS SecondHighestSalary
FROM Employee`,
    setupSql: `
CREATE TABLE Employee (id INTEGER PRIMARY KEY, salary INTEGER);
INSERT INTO Employee VALUES (1, 100), (2, 200), (3, 300);`,
    testCases: [
      { expectedRows: [[200]], label: 'Standard case' },
    ],
    hints: [
      'Use a subquery to exclude the MAX salary, then take MAX of the rest.',
      'Wrap in another SELECT to return NULL when no row exists.',
    ],
    solution: `SELECT MAX(salary) AS SecondHighestSalary
FROM Employee
WHERE salary < (SELECT MAX(salary) FROM Employee)`,
  },

  {
    id: 'sql-customers-never-order',
    title: 'Customers Who Never Order',
    lang: 'sql',
    difficulty: 'easy',
    tags: ['join', 'subquery'],
    description: `Find all customers who **never placed an order**.

**Table: Customers**
| Column | Type    |
|--------|---------|
| id     | INTEGER |
| name   | TEXT    |

**Table: Orders**
| Column      | Type    |
|-------------|---------|
| id          | INTEGER |
| customer_id | INTEGER |

**Example**
\`\`\`
Output the Name column of customers with no orders.
\`\`\``,
    starterCode: `-- Write your query here
SELECT name AS Customers
FROM Customers
-- filter to those without orders`,
    setupSql: `
CREATE TABLE Customers (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE Orders (id INTEGER PRIMARY KEY, customer_id INTEGER);
INSERT INTO Customers VALUES (1, 'Joe'), (2, 'Henry'), (3, 'Sam'), (4, 'Max');
INSERT INTO Orders VALUES (1, 3), (2, 1);`,
    testCases: [
      { expectedRows: [['Henry'], ['Max']], label: 'Two without orders', orderInsensitive: true },
    ],
    hints: [
      'Use NOT IN (SELECT customer_id FROM Orders).',
      'Or use a LEFT JOIN and filter WHERE Orders.id IS NULL.',
    ],
    solution: `SELECT name AS Customers FROM Customers
WHERE id NOT IN (SELECT customer_id FROM Orders)`,
  },

  {
    id: 'sql-employees-earn-more',
    title: 'Employees Earning More Than Managers',
    lang: 'sql',
    difficulty: 'easy',
    tags: ['self-join'],
    description: `Find all employees who earn **more than their manager**.

**Table: Employee**
| Column    | Type    |
|-----------|---------|
| id        | INTEGER |
| name      | TEXT    |
| salary    | INTEGER |
| manager_id| INTEGER |

Return the \`name\` column (aliased as \`Employee\`).`,
    starterCode: `-- Write your query here using a self-join
SELECT e.name AS Employee
FROM Employee e`,
    setupSql: `
CREATE TABLE Employee (id INTEGER PRIMARY KEY, name TEXT, salary INTEGER, manager_id INTEGER);
INSERT INTO Employee VALUES
  (1, 'Joe',   70000, 3),
  (2, 'Henry', 80000, 4),
  (3, 'Sam',   60000, NULL),
  (4, 'Max',   90000, NULL);`,
    testCases: [
      { expectedRows: [['Joe']], label: 'Joe earns more than Sam' },
    ],
    hints: [
      'JOIN the Employee table with itself — e (employee) and m (manager).',
      'Filter WHERE e.salary > m.salary.',
    ],
    solution: `SELECT e.name AS Employee
FROM Employee e JOIN Employee m ON e.manager_id = m.id
WHERE e.salary > m.salary`,
  },

  {
    id: 'sql-rank-scores',
    title: 'Rank Scores',
    lang: 'sql',
    difficulty: 'medium',
    tags: ['window-function', 'subquery'],
    description: `Rank each score in the \`Scores\` table. Ranking should be:
- Sorted high to low.
- No gaps between ranks (dense rank).

**Table: Scores**
| Column | Type  |
|--------|-------|
| id     | INT   |
| score  | REAL  |

**Example**
\`\`\`
Input:  [3.50, 3.65, 4.00, 3.85, 4.00, 3.65]
Output:
score | rank
4.00  | 1
4.00  | 1
3.85  | 2
3.65  | 3
3.65  | 3
3.50  | 4
\`\`\``,
    starterCode: `-- Write your query here
SELECT score, ??? AS rank
FROM Scores
ORDER BY score DESC`,
    setupSql: `
CREATE TABLE Scores (id INTEGER PRIMARY KEY, score REAL);
INSERT INTO Scores VALUES (1,3.50),(2,3.65),(3,4.00),(4,3.85),(5,4.00),(6,3.65);`,
    testCases: [
      { expectedRows: [[4.00,1],[4.00,1],[3.85,2],[3.65,3],[3.65,3],[3.50,4]], label: 'Dense rank' },
    ],
    hints: [
      'Count distinct scores that are >= the current score.',
      'Subquery: `(SELECT COUNT(DISTINCT score) FROM Scores s2 WHERE s2.score >= s1.score)`.',
    ],
    solution: `SELECT score,
  (SELECT COUNT(DISTINCT s2.score) FROM Scores s2 WHERE s2.score >= s1.score) AS rank
FROM Scores s1
ORDER BY score DESC`,
  },

  // ──────────────────────────── MONGODB ────────────────────────────

  {
    id: 'mongo-find-by-age',
    title: 'Find Users by Age Range',
    lang: 'mongodb',
    difficulty: 'easy',
    tags: ['find', 'query-operators'],
    description: `Find all users aged **between 25 and 35 (inclusive)** from the \`users\` collection.

**Sample Collection: users**
\`\`\`json
{ "name": "Alice", "age": 28, "city": "NY" }
{ "name": "Bob",   "age": 22, "city": "LA" }
{ "name": "Carol", "age": 35, "city": "SF" }
{ "name": "Dave",  "age": 41, "city": "NY" }
\`\`\`

Return only \`name\` and \`age\` fields (no \`_id\`). Sort by age ascending.`,
    starterCode: `// The 'users' collection is pre-loaded for you.
// Write your query, then pass results to printJSON().

db.use('interview');
const result = db.collection('users').find(
  { /* your filter here */ },
  { /* projection: which fields to return */ }
).toArray();
printJSON(result);`,
    setupMongo: [
      { name: 'Alice', age: 28, city: 'NY' },
      { name: 'Bob',   age: 22, city: 'LA' },
      { name: 'Carol', age: 35, city: 'SF' },
      { name: 'Dave',  age: 41, city: 'NY' },
    ],
    setupCollection: 'users',
    testCases: [
      { expectedDocs: [{ name: 'Alice', age: 28 }, { name: 'Carol', age: 35 }], label: 'Age 25-35', orderInsensitive: true },
    ],
    hints: [
      'Use `$gte` and `$lte` operators: `{ age: { $gte: 25, $lte: 35 } }`.',
      'Projection: `{ name: 1, age: 1, _id: 0 }`.',
    ],
    solution: `db.use('interview');
const result = db.collection('users').find(
  { age: { $gte: 25, $lte: 35 } },
  { name: 1, age: 1, _id: 0 }
).toArray();
printJSON(result);`,
  },

  {
    id: 'mongo-count-by-category',
    title: 'Count Products by Category',
    lang: 'mongodb',
    difficulty: 'easy',
    tags: ['aggregation', 'group'],
    description: `Using the \`products\` collection, group products by \`category\` and return the **count** per category. Sort by count descending.

**Sample Collection: products**
\`\`\`json
{ "name": "Laptop",  "category": "Electronics", "price": 999 }
{ "name": "Phone",   "category": "Electronics", "price": 699 }
{ "name": "Chair",   "category": "Furniture",   "price": 299 }
{ "name": "Desk",    "category": "Furniture",   "price": 499 }
{ "name": "Monitor", "category": "Electronics", "price": 399 }
\`\`\`

Expected output:
\`\`\`json
{ "category": "Electronics", "count": 3 }
{ "category": "Furniture",   "count": 2 }
\`\`\``,
    starterCode: `db.use('interview');
const result = db.collection('products').aggregate([
  // your pipeline here
]).toArray();
printJSON(result);`,
    setupMongo: [
      { name: 'Laptop',  category: 'Electronics', price: 999 },
      { name: 'Phone',   category: 'Electronics', price: 699 },
      { name: 'Chair',   category: 'Furniture',   price: 299 },
      { name: 'Desk',    category: 'Furniture',   price: 499 },
      { name: 'Monitor', category: 'Electronics', price: 399 },
    ],
    setupCollection: 'products',
    testCases: [
      { expectedDocs: [{ category: 'Electronics', count: 3 }, { category: 'Furniture', count: 2 }], label: 'Group by category' },
    ],
    hints: [
      'Use a `$group` stage with `_id: "$category"` and `count: { $sum: 1 }`.',
      'Follow with `$sort: { count: -1 }` for descending order.',
      'Use `$project` to rename `_id` to `category`.',
    ],
    solution: `db.use('interview');
const result = db.collection('products').aggregate([
  { $group: { _id: '$category', count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $project: { _id: 0, category: '$_id', count: 1 } }
]).toArray();
printJSON(result);`,
  },

  {
    id: 'mongo-avg-salary-dept',
    title: 'Average Salary by Department',
    lang: 'mongodb',
    difficulty: 'medium',
    tags: ['aggregation', 'group', 'avg'],
    description: `From the \`employees\` collection, compute the **average salary** for each department. Return results sorted by average salary descending, rounded to 2 decimal places.

**Sample Collection: employees**
\`\`\`json
{ "name": "Alice", "department": "Engineering", "salary": 120000 }
{ "name": "Bob",   "department": "Marketing",   "salary":  80000 }
{ "name": "Carol", "department": "Engineering", "salary": 140000 }
{ "name": "Dave",  "department": "Marketing",   "salary":  90000 }
{ "name": "Eve",   "department": "HR",          "salary":  70000 }
\`\`\``,
    starterCode: `db.use('interview');
const result = db.collection('employees').aggregate([
  // your pipeline here
]).toArray();
printJSON(result);`,
    setupMongo: [
      { name: 'Alice', department: 'Engineering', salary: 120000 },
      { name: 'Bob',   department: 'Marketing',   salary:  80000 },
      { name: 'Carol', department: 'Engineering', salary: 140000 },
      { name: 'Dave',  department: 'Marketing',   salary:  90000 },
      { name: 'Eve',   department: 'HR',          salary:  70000 },
    ],
    setupCollection: 'employees',
    testCases: [
      {
        expectedDocs: [
          { department: 'Engineering', avgSalary: 130000 },
          { department: 'Marketing',   avgSalary: 85000  },
          { department: 'HR',          avgSalary: 70000  },
        ],
        label: 'Avg salary by dept',
      },
    ],
    hints: [
      'Group by `$department` with `avgSalary: { $avg: "$salary" }`.',
      'Sort by `avgSalary: -1` then project to rename `_id`.',
    ],
    solution: `db.use('interview');
const result = db.collection('employees').aggregate([
  { $group: { _id: '$department', avgSalary: { $avg: '$salary' } } },
  { $sort: { avgSalary: -1 } },
  { $project: { _id: 0, department: '$_id', avgSalary: 1 } }
]).toArray();
printJSON(result);`,
  },

  {
    id: 'mongo-top3-products',
    title: 'Top 3 Products by Rating',
    lang: 'mongodb',
    difficulty: 'medium',
    tags: ['aggregation', 'sort', 'limit'],
    description: `Return the **top 3 products** with the highest average \`rating\` from the \`reviews\` collection. Each document is one review.

**Sample Collection: reviews**
\`\`\`json
{ "product": "Laptop",  "rating": 4.5 }
{ "product": "Laptop",  "rating": 4.8 }
{ "product": "Phone",   "rating": 3.9 }
{ "product": "Monitor", "rating": 4.6 }
{ "product": "Monitor", "rating": 4.4 }
{ "product": "Keyboard","rating": 4.7 }
{ "product": "Mouse",   "rating": 4.2 }
\`\`\`

Return fields: \`product\`, \`avgRating\` (rounded to 2 decimals).`,
    starterCode: `db.use('interview');
const result = db.collection('reviews').aggregate([
  // your pipeline here
]).toArray();
printJSON(result);`,
    setupMongo: [
      { product: 'Laptop',   rating: 4.5 },
      { product: 'Laptop',   rating: 4.8 },
      { product: 'Phone',    rating: 3.9 },
      { product: 'Monitor',  rating: 4.6 },
      { product: 'Monitor',  rating: 4.4 },
      { product: 'Keyboard', rating: 4.7 },
      { product: 'Mouse',    rating: 4.2 },
    ],
    setupCollection: 'reviews',
    testCases: [
      {
        expectedDocs: [
          { product: 'Laptop',   avgRating: 4.65 },
          { product: 'Keyboard', avgRating: 4.7  },
          { product: 'Monitor',  avgRating: 4.5  },
        ],
        label: 'Top 3 by avg rating',
        orderInsensitive: true,
      },
    ],
    hints: [
      'Group by `$product`, compute `avgRating: { $avg: "$rating" }`.',
      'Sort by `avgRating: -1` then `$limit: 3`.',
    ],
    solution: `db.use('interview');
const result = db.collection('reviews').aggregate([
  { $group: { _id: '$product', avgRating: { $avg: '$rating' } } },
  { $sort: { avgRating: -1 } },
  { $limit: 3 },
  { $project: { _id: 0, product: '$_id', avgRating: 1 } }
]).toArray();
printJSON(result);`,
  },
];
