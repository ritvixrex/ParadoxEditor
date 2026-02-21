(function () {
  window.CHALLENGES = [
    {
      id: 'fizzbuzz',
      title: 'FizzBuzz',
      difficulty: 'Easy',
      tags: ['loops', 'conditionals'],
      description: `Write a function fizzBuzz(n) that returns an array of strings from 1 to n.
For multiples of 3, use "Fizz". For multiples of 5, use "Buzz".
For multiples of both 3 and 5, use "FizzBuzz". Otherwise use the number as a string.

Example: fizzBuzz(5) => ["1", "2", "Fizz", "4", "Buzz"]`,
      starterCode: {
        javascript: `function fizzBuzz(n) {
  // Your code here
}`,
        python: `def fizzBuzz(n):
    # Your code here
    pass`
      },
      testCases: [
        { input: '5',  expectedValue: ['1','2','Fizz','4','Buzz'] },
        { input: '15', expectedValue: ['1','2','Fizz','4','Buzz','6','7','Fizz','9','Buzz','11','Fizz','13','14','FizzBuzz'] },
        { input: '1',  expectedValue: ['1'] },
      ],
      hints: [
        'Use a loop from 1 to n (inclusive).',
        'Check divisibility with the modulo operator: n % 3 === 0.',
        'Check the FizzBuzz condition (divisible by both 3 and 5) BEFORE checking Fizz or Buzz individually.',
      ],
      solution: {
        javascript: `function fizzBuzz(n) {
  const result = [];
  for (let i = 1; i <= n; i++) {
    if (i % 15 === 0) result.push("FizzBuzz");
    else if (i % 3 === 0) result.push("Fizz");
    else if (i % 5 === 0) result.push("Buzz");
    else result.push(String(i));
  }
  return result;
}`,
        python: `def fizzBuzz(n):
    result = []
    for i in range(1, n + 1):
        if i % 15 == 0:
            result.append("FizzBuzz")
        elif i % 3 == 0:
            result.append("Fizz")
        elif i % 5 == 0:
            result.append("Buzz")
        else:
            result.append(str(i))
    return result`
      }
    },
    {
      id: 'two_sum',
      title: 'Two Sum',
      difficulty: 'Easy',
      tags: ['hash map', 'arrays'],
      description: `Given an array of integers nums and a target integer target, return the indices of the two numbers that add up to target.
Assume exactly one solution exists. Do not use the same element twice.

Example: twoSum([2,7,11,15], 9) => [0, 1]`,
      starterCode: {
        javascript: `function twoSum(nums, target) {
  // Your code here
}`,
        python: `def twoSum(nums, target):
    # Your code here
    pass`
      },
      testCases: [
        { input: '[2,7,11,15], 9', expectedValue: [0, 1] },
        { input: '[3,2,4], 6',     expectedValue: [1, 2] },
        { input: '[3,3], 6',       expectedValue: [0, 1] },
      ],
      hints: [
        'A brute-force O(n^2) solution uses two nested loops to try all pairs.',
        'For O(n), use a hash map (object in JS / dict in Python) to store numbers you have already seen.',
        'For each number, check if (target - number) already exists in the map. If yes, return both indices.',
      ],
      solution: {
        javascript: `function twoSum(nums, target) {
  const map = {};
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (map[complement] !== undefined) return [map[complement], i];
    map[nums[i]] = i;
  }
}`,
        python: `def twoSum(nums, target):
    seen = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i`
      }
    },
    {
      id: 'fibonacci',
      title: 'Fibonacci',
      difficulty: 'Easy',
      tags: ['recursion', 'dynamic programming'],
      description: `Write a function fibonacci(n) that returns the nth Fibonacci number.
The sequence starts: 0, 1, 1, 2, 3, 5, 8, 13...
fibonacci(0) = 0, fibonacci(1) = 1.

Example: fibonacci(6) => 8`,
      starterCode: {
        javascript: `function fibonacci(n) {
  // Your code here
}`,
        python: `def fibonacci(n):
    # Your code here
    pass`
      },
      testCases: [
        { input: '0',  expectedValue: 0 },
        { input: '1',  expectedValue: 1 },
        { input: '6',  expectedValue: 8 },
        { input: '10', expectedValue: 55 },
      ],
      hints: [
        'Base cases: fibonacci(0) = 0 and fibonacci(1) = 1.',
        'Recursive solution: return fibonacci(n-1) + fibonacci(n-2). (Watch out for exponential time!)',
        'For O(n) time, use iteration with two variables tracking the last two values.',
      ],
      solution: {
        javascript: `function fibonacci(n) {
  if (n <= 1) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}`,
        python: `def fibonacci(n):
    if n <= 1:
        return n
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b`
      }
    },
    {
      id: 'palindrome',
      title: 'Palindrome Check',
      difficulty: 'Easy',
      tags: ['strings', 'two pointers'],
      description: `Write a function isPalindrome(s) that returns true if s reads the same forwards and backwards.
Ignore case and non-alphanumeric characters.

Example: isPalindrome("A man, a plan, a canal: Panama") => true
Example: isPalindrome("race a car") => false`,
      starterCode: {
        javascript: `function isPalindrome(s) {
  // Your code here
}`,
        python: `def isPalindrome(s):
    # Your code here
    pass`
      },
      testCases: [
        { input: '"A man, a plan, a canal: Panama"', expectedValue: true },
        { input: '"race a car"',                     expectedValue: false },
        { input: '""',                               expectedValue: true },
        { input: '"Was it a car or a cat I saw?"',   expectedValue: true },
      ],
      hints: [
        'Strip out non-alphanumeric characters and convert to lowercase first.',
        'Then compare the cleaned string with its reverse.',
        'Two-pointer approach: compare characters from both ends moving inward — stop when pointers meet.',
      ],
      solution: {
        javascript: `function isPalindrome(s) {
  const cleaned = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleaned === cleaned.split('').reverse().join('');
}`,
        python: `def isPalindrome(s):
    cleaned = ''.join(c.lower() for c in s if c.isalnum())
    return cleaned == cleaned[::-1]`
      }
    },
    {
      id: 'valid_brackets',
      title: 'Valid Brackets',
      difficulty: 'Medium',
      tags: ['stack', 'strings'],
      description: `Write a function isValid(s) that determines if the input string has valid bracket pairs.
Valid brackets are '(', ')', '{', '}', '[', ']'.
Every opening bracket must be closed in the correct order.

Example: isValid("()[]{}") => true
Example: isValid("([)]") => false`,
      starterCode: {
        javascript: `function isValid(s) {
  // Your code here
}`,
        python: `def isValid(s):
    # Your code here
    pass`
      },
      testCases: [
        { input: '"()"',     expectedValue: true },
        { input: '"()[]{}"', expectedValue: true },
        { input: '"(]"',     expectedValue: false },
        { input: '"([)]"',   expectedValue: false },
        { input: '"{[]}"',   expectedValue: true },
      ],
      hints: [
        'Use a stack (array with push/pop) to track opening brackets.',
        'When you see a closing bracket, check if the top of the stack is the matching opener.',
        'At the end, the stack must be empty for the string to be valid.',
      ],
      solution: {
        javascript: `function isValid(s) {
  const stack = [];
  const map = { ')': '(', '}': '{', ']': '[' };
  for (const ch of s) {
    if ('({['.includes(ch)) stack.push(ch);
    else if (stack.pop() !== map[ch]) return false;
  }
  return stack.length === 0;
}`,
        python: `def isValid(s):
    stack = []
    mapping = {')': '(', '}': '{', ']': '['}
    for ch in s:
        if ch in '({[':
            stack.append(ch)
        elif not stack or stack.pop() != mapping.get(ch, ''):
            return False
    return len(stack) == 0`
      }
    },
    {
      id: 'binary_search',
      title: 'Binary Search',
      difficulty: 'Easy',
      tags: ['binary search', 'arrays'],
      description: `Write a function binarySearch(nums, target) that searches for target in a sorted array.
Return the index if found, or -1 if not present.

Example: binarySearch([-1,0,3,5,9,12], 9) => 4
Example: binarySearch([-1,0,3,5,9,12], 2) => -1`,
      starterCode: {
        javascript: `function binarySearch(nums, target) {
  // Your code here
}`,
        python: `def binarySearch(nums, target):
    # Your code here
    pass`
      },
      testCases: [
        { input: '[-1,0,3,5,9,12], 9', expectedValue: 4 },
        { input: '[-1,0,3,5,9,12], 2', expectedValue: -1 },
        { input: '[5], 5',             expectedValue: 0 },
        { input: '[1,3,5,7,9], 7',    expectedValue: 3 },
      ],
      hints: [
        'Maintain left and right pointers that define the current search range.',
        'Calculate mid = Math.floor((left + right) / 2). Compare nums[mid] with target.',
        'If nums[mid] < target, search the right half (left = mid + 1). If greater, search left (right = mid - 1).',
      ],
      solution: {
        javascript: `function binarySearch(nums, target) {
  let left = 0, right = nums.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (nums[mid] === target) return mid;
    else if (nums[mid] < target) left = mid + 1;
    else right = mid - 1;
  }
  return -1;
}`,
        python: `def binarySearch(nums, target):
    left, right = 0, len(nums) - 1
    while left <= right:
        mid = (left + right) // 2
        if nums[mid] == target:
            return mid
        elif nums[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1`
      }
    },
    {
      id: 'count_vowels',
      title: 'Count Vowels',
      difficulty: 'Easy',
      tags: ['strings'],
      description: `Write a function countVowels(s) that returns the number of vowel characters (a, e, i, o, u) in the string.
Ignore case.

Example: countVowels("Hello World") => 3`,
      starterCode: {
        javascript: `function countVowels(s) {
  // Your code here
}`,
        python: `def countVowels(s):
    # Your code here
    pass`
      },
      testCases: [
        { input: '"Hello World"', expectedValue: 3 },
        { input: '"aeiou"',       expectedValue: 5 },
        { input: '"bcdfg"',       expectedValue: 0 },
        { input: '""',            expectedValue: 0 },
      ],
      hints: [
        'Convert the string to lowercase first to handle both cases uniformly.',
        'Loop through each character and check if it is in the set "aeiou".',
        'In JS you can use: (s.match(/[aeiou]/gi) || []).length',
      ],
      solution: {
        javascript: `function countVowels(s) {
  return (s.match(/[aeiou]/gi) || []).length;
}`,
        python: `def countVowels(s):
    return sum(1 for c in s.lower() if c in 'aeiou')`
      }
    },
    {
      id: 'reverse_string',
      title: 'Reverse String',
      difficulty: 'Easy',
      tags: ['strings', 'two pointers'],
      description: `Write a function reverseString(s) that reverses a string and returns it.

Example: reverseString("hello") => "olleh"
Example: reverseString("Hannah") => "hannaH"`,
      starterCode: {
        javascript: `function reverseString(s) {
  // Your code here
}`,
        python: `def reverseString(s):
    # Your code here
    pass`
      },
      testCases: [
        { input: '"hello"',  expectedValue: 'olleh' },
        { input: '"Hannah"', expectedValue: 'hannaH' },
        { input: '"a"',      expectedValue: 'a' },
        { input: '""',       expectedValue: '' },
      ],
      hints: [
        'In JavaScript, split the string into an array, reverse it, then join back.',
        'In Python, use slicing: s[::-1].',
        'Two-pointer approach: swap characters at both ends, moving inward until pointers meet.',
      ],
      solution: {
        javascript: `function reverseString(s) {
  return s.split('').reverse().join('');
}`,
        python: `def reverseString(s):
    return s[::-1]`
      }
    },
  ];
})();
