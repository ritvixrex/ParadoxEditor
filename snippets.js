// ParadoxEditor Algorithm Snippets
window.ParadoxSnippets = [
  // ===== SORTING =====
  {
    category: 'Sorting',
    name: 'Bubble Sort',
    language: 'javascript',
    code: `function bubbleSort(arr) {
  const n = arr.length;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - i - 1; j++) {
      if (arr[j] > arr[j + 1]) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
      }
    }
  }
  return arr;
}
console.log(bubbleSort([64, 34, 25, 12, 22, 11, 90]));`
  },
  {
    category: 'Sorting',
    name: 'Merge Sort',
    language: 'javascript',
    code: `function mergeSort(arr) {
  if (arr.length <= 1) return arr;
  const mid = Math.floor(arr.length / 2);
  const left = mergeSort(arr.slice(0, mid));
  const right = mergeSort(arr.slice(mid));
  return merge(left, right);
}

function merge(left, right) {
  const result = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] <= right[j]) result.push(left[i++]);
    else result.push(right[j++]);
  }
  return [...result, ...left.slice(i), ...right.slice(j)];
}
console.log(mergeSort([38, 27, 43, 3, 9, 82, 10]));`
  },
  {
    category: 'Sorting',
    name: 'Quick Sort',
    language: 'javascript',
    code: `function quickSort(arr, low = 0, high = arr.length - 1) {
  if (low < high) {
    const pi = partition(arr, low, high);
    quickSort(arr, low, pi - 1);
    quickSort(arr, pi + 1, high);
  }
  return arr;
}

function partition(arr, low, high) {
  const pivot = arr[high];
  let i = low - 1;
  for (let j = low; j < high; j++) {
    if (arr[j] <= pivot) {
      i++;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  [arr[i + 1], arr[high]] = [arr[high], arr[i + 1]];
  return i + 1;
}
console.log(quickSort([10, 7, 8, 9, 1, 5]));`
  },

  // ===== SEARCHING =====
  {
    category: 'Searching',
    name: 'Binary Search',
    language: 'javascript',
    code: `function binarySearch(arr, target) {
  let left = 0, right = arr.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) left = mid + 1;
    else right = mid - 1;
  }
  return -1;
}
const sorted = [1, 3, 5, 7, 9, 11, 13, 15];
console.log(binarySearch(sorted, 7));  // → 3
console.log(binarySearch(sorted, 6));  // → -1`
  },
  {
    category: 'Searching',
    name: 'Linear Search',
    language: 'javascript',
    code: `function linearSearch(arr, target) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === target) return i;
  }
  return -1;
}
console.log(linearSearch([4, 2, 7, 1, 9], 7));  // → 2`
  },

  // ===== TWO POINTERS =====
  {
    category: 'Two Pointers',
    name: 'Two Sum (Sorted)',
    language: 'javascript',
    code: `function twoSumSorted(nums, target) {
  let left = 0, right = nums.length - 1;
  while (left < right) {
    const sum = nums[left] + nums[right];
    if (sum === target) return [left, right];
    if (sum < target) left++;
    else right--;
  }
  return [];
}
console.log(twoSumSorted([1, 2, 3, 4, 6], 6));  // → [1, 3]`
  },
  {
    category: 'Two Pointers',
    name: 'Sliding Window (Max Sum)',
    language: 'javascript',
    code: `function maxSubarraySum(arr, k) {
  let maxSum = 0, windowSum = 0;
  for (let i = 0; i < k; i++) windowSum += arr[i];
  maxSum = windowSum;
  for (let i = k; i < arr.length; i++) {
    windowSum += arr[i] - arr[i - k];
    maxSum = Math.max(maxSum, windowSum);
  }
  return maxSum;
}
console.log(maxSubarraySum([2, 1, 5, 1, 3, 2], 3));  // → 9`
  },

  // ===== GRAPH TRAVERSAL =====
  {
    category: 'Graph',
    name: 'BFS (Breadth-First Search)',
    language: 'javascript',
    code: `function bfs(graph, start) {
  const visited = new Set();
  const queue = [start];
  const result = [];
  visited.add(start);
  while (queue.length > 0) {
    const node = queue.shift();
    result.push(node);
    for (const neighbor of (graph[node] || [])) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return result;
}
const graph = { A: ['B', 'C'], B: ['D'], C: ['D', 'E'], D: [], E: [] };
console.log(bfs(graph, 'A'));  // → ['A', 'B', 'C', 'D', 'E']`
  },
  {
    category: 'Graph',
    name: 'DFS (Depth-First Search)',
    language: 'javascript',
    code: `function dfs(graph, start, visited = new Set()) {
  visited.add(start);
  const result = [start];
  for (const neighbor of (graph[start] || [])) {
    if (!visited.has(neighbor)) {
      result.push(...dfs(graph, neighbor, visited));
    }
  }
  return result;
}
const graph = { A: ['B', 'C'], B: ['D'], C: ['E'], D: [], E: [] };
console.log(dfs(graph, 'A'));  // → ['A', 'B', 'D', 'C', 'E']`
  },

  // ===== DYNAMIC PROGRAMMING =====
  {
    category: 'Dynamic Programming',
    name: 'Fibonacci (Memoization)',
    language: 'javascript',
    code: `function fibonacci(n, memo = {}) {
  if (n <= 1) return n;
  if (memo[n]) return memo[n];
  memo[n] = fibonacci(n - 1, memo) + fibonacci(n - 2, memo);
  return memo[n];
}
for (let i = 0; i <= 10; i++) {
  console.log(\`fib(\${i}) = \${fibonacci(i)}\`);
}`
  },
  {
    category: 'Dynamic Programming',
    name: 'Fibonacci (Tabulation)',
    language: 'javascript',
    code: `function fibTabulation(n) {
  if (n <= 1) return n;
  const dp = [0, 1];
  for (let i = 2; i <= n; i++) {
    dp[i] = dp[i - 1] + dp[i - 2];
  }
  return dp[n];
}
console.log(fibTabulation(10));  // → 55`
  },
  {
    category: 'Dynamic Programming',
    name: 'Longest Common Subsequence',
    language: 'javascript',
    code: `function lcs(s1, s2) {
  const m = s1.length, n = s2.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}
console.log(lcs("ABCBDAB", "BDCAB"));  // → 4`
  },
  {
    category: 'Dynamic Programming',
    name: 'Knapsack (0/1)',
    language: 'javascript',
    code: `function knapsack(weights, values, capacity) {
  const n = weights.length;
  const dp = Array.from({ length: n + 1 }, () => Array(capacity + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let w = 0; w <= capacity; w++) {
      dp[i][w] = dp[i - 1][w];
      if (weights[i - 1] <= w) {
        dp[i][w] = Math.max(dp[i][w], dp[i - 1][w - weights[i - 1]] + values[i - 1]);
      }
    }
  }
  return dp[n][capacity];
}
console.log(knapsack([2, 3, 4, 5], [3, 4, 5, 6], 8));  // → 10`
  },

  // ===== DATA STRUCTURES =====
  {
    category: 'Data Structures',
    name: 'Stack',
    language: 'javascript',
    code: `class Stack {
  constructor() { this.items = []; }
  push(val) { this.items.push(val); }
  pop() { return this.items.pop(); }
  peek() { return this.items[this.items.length - 1]; }
  isEmpty() { return this.items.length === 0; }
  size() { return this.items.length; }
}
const stack = new Stack();
stack.push(1); stack.push(2); stack.push(3);
console.log(stack.peek());  // → 3
console.log(stack.pop());   // → 3
console.log(stack.size());  // → 2`
  },
  {
    category: 'Data Structures',
    name: 'Queue',
    language: 'javascript',
    code: `class Queue {
  constructor() { this.items = []; }
  enqueue(val) { this.items.push(val); }
  dequeue() { return this.items.shift(); }
  front() { return this.items[0]; }
  isEmpty() { return this.items.length === 0; }
  size() { return this.items.length; }
}
const q = new Queue();
q.enqueue('a'); q.enqueue('b'); q.enqueue('c');
console.log(q.dequeue());  // → 'a'
console.log(q.front());   // → 'b'`
  },
  {
    category: 'Data Structures',
    name: 'Linked List (Singly)',
    language: 'javascript',
    code: `class Node {
  constructor(val) { this.val = val; this.next = null; }
}
class LinkedList {
  constructor() { this.head = null; this.size = 0; }
  append(val) {
    const node = new Node(val);
    if (!this.head) { this.head = node; }
    else {
      let curr = this.head;
      while (curr.next) curr = curr.next;
      curr.next = node;
    }
    this.size++;
  }
  toArray() {
    const arr = [];
    let curr = this.head;
    while (curr) { arr.push(curr.val); curr = curr.next; }
    return arr;
  }
}
const list = new LinkedList();
list.append(1); list.append(2); list.append(3);
console.log(list.toArray());  // → [1, 2, 3]`
  },
  {
    category: 'Data Structures',
    name: 'Binary Search Tree',
    language: 'javascript',
    code: `class BSTNode { constructor(val) { this.val = val; this.left = this.right = null; } }
class BST {
  constructor() { this.root = null; }
  insert(val) {
    const node = new BSTNode(val);
    if (!this.root) { this.root = node; return; }
    let curr = this.root;
    while (true) {
      if (val < curr.val) {
        if (!curr.left) { curr.left = node; return; }
        curr = curr.left;
      } else {
        if (!curr.right) { curr.right = node; return; }
        curr = curr.right;
      }
    }
  }
  inorder(node = this.root, result = []) {
    if (node) { this.inorder(node.left, result); result.push(node.val); this.inorder(node.right, result); }
    return result;
  }
}
const bst = new BST();
[5, 3, 7, 1, 4, 6, 8].forEach(v => bst.insert(v));
console.log(bst.inorder());  // → [1, 3, 4, 5, 6, 7, 8]`
  },
  {
    category: 'Data Structures',
    name: 'HashMap (Frequency Counter)',
    language: 'javascript',
    code: `function frequencyCounter(arr) {
  const freq = new Map();
  for (const val of arr) {
    freq.set(val, (freq.get(val) || 0) + 1);
  }
  return freq;
}
const result = frequencyCounter([1, 2, 2, 3, 3, 3, 4]);
result.forEach((count, val) => console.log(\`\${val}: \${count}\`));`
  },

  // ===== STRING ALGORITHMS =====
  {
    category: 'Strings',
    name: 'Palindrome Check',
    language: 'javascript',
    code: `function isPalindrome(s) {
  s = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  let left = 0, right = s.length - 1;
  while (left < right) {
    if (s[left] !== s[right]) return false;
    left++; right--;
  }
  return true;
}
console.log(isPalindrome("A man, a plan, a canal: Panama"));  // → true
console.log(isPalindrome("race a car"));  // → false`
  },
  {
    category: 'Strings',
    name: 'Anagram Check',
    language: 'javascript',
    code: `function isAnagram(s, t) {
  if (s.length !== t.length) return false;
  const count = {};
  for (const c of s) count[c] = (count[c] || 0) + 1;
  for (const c of t) {
    if (!count[c]) return false;
    count[c]--;
  }
  return true;
}
console.log(isAnagram("anagram", "nagaram"));  // → true
console.log(isAnagram("rat", "car"));  // → false`
  },

  // ===== MATH =====
  {
    category: 'Math',
    name: 'GCD / Euclidean',
    language: 'javascript',
    code: `function gcd(a, b) {
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}
function lcm(a, b) { return (a / gcd(a, b)) * b; }
console.log(gcd(48, 18));   // → 6
console.log(lcm(4, 6));     // → 12`
  },
  {
    category: 'Math',
    name: 'Sieve of Eratosthenes',
    language: 'javascript',
    code: `function sieve(n) {
  const primes = Array(n + 1).fill(true);
  primes[0] = primes[1] = false;
  for (let i = 2; i * i <= n; i++) {
    if (primes[i]) {
      for (let j = i * i; j <= n; j += i) primes[j] = false;
    }
  }
  return primes.map((isPrime, i) => isPrime ? i : null).filter(Boolean);
}
console.log(sieve(30));  // → [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]`
  },

  // ===== PYTHON SNIPPETS =====
  {
    category: 'Sorting',
    name: 'Bubble Sort',
    language: 'python',
    code: `def bubble_sort(arr):
    n = len(arr)
    for i in range(n - 1):
        for j in range(n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
    return arr

print(bubble_sort([64, 34, 25, 12, 22, 11, 90]))`
  },
  {
    category: 'Searching',
    name: 'Binary Search',
    language: 'python',
    code: `def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1

sorted_arr = [1, 3, 5, 7, 9, 11]
print(binary_search(sorted_arr, 7))   # → 3
print(binary_search(sorted_arr, 6))   # → -1`
  },
  {
    category: 'Dynamic Programming',
    name: 'Fibonacci (Memoization)',
    language: 'python',
    code: `from functools import lru_cache

@lru_cache(maxsize=None)
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

for i in range(11):
    print(f"fib({i}) = {fibonacci(i)}")`
  },
  {
    category: 'Graph',
    name: 'BFS',
    language: 'python',
    code: `from collections import deque

def bfs(graph, start):
    visited = set()
    queue = deque([start])
    result = []
    visited.add(start)
    while queue:
        node = queue.popleft()
        result.append(node)
        for neighbor in graph.get(node, []):
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)
    return result

graph = {'A': ['B', 'C'], 'B': ['D'], 'C': ['D', 'E'], 'D': [], 'E': []}
print(bfs(graph, 'A'))`
  },
  {
    category: 'Data Structures',
    name: 'Stack',
    language: 'python',
    code: `class Stack:
    def __init__(self):
        self.items = []
    def push(self, val): self.items.append(val)
    def pop(self): return self.items.pop()
    def peek(self): return self.items[-1] if self.items else None
    def is_empty(self): return len(self.items) == 0
    def size(self): return len(self.items)

stack = Stack()
stack.push(1); stack.push(2); stack.push(3)
print(stack.peek())  # → 3
print(stack.pop())   # → 3
print(stack.size())  # → 2`
  },
];
