// --- DOM Element References ---
const apiKeySection = document.getElementById("apiKeySection");
const generatorSection = document.getElementById("generatorSection");
const apiKeyInput = document.getElementById("apiKeyInput");
const saveApiKeyButton = document.getElementById("saveApiKey");
const apiKeyError = document.getElementById("apiKeyError");
const topicInput = document.getElementById("topicInput");
const generateSheetsButton = document.getElementById("generateSheets");
const generateButtonText = document.getElementById("generateButtonText");
const generateLoader = document.getElementById("generateLoader");
const sheetsContainer = document.getElementById("sheetsContainer");
const resetApiKeyButton = document.getElementById("resetApiKey");
const leetcodeHandleInput = document.getElementById("leetcodeHandle");
const codeforcesHandleInput = document.getElementById("codeforcesHandle");
const loadSolvedButton = document.getElementById("loadSolved");
const loadButtonText = document.getElementById("loadButtonText");
const loadLoader = document.getElementById("loadLoader");
const solvedStatus = document.getElementById("solvedStatus");

// --- State Variables ---
let geminiApiKey = "";
let solvedLeetCode = new Set();
let solvedCodeforces = new Set();

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
  // Load API Key
  const savedKey = localStorage.getItem("geminiApiKey");
  if (savedKey) {
    geminiApiKey = savedKey;
    apiKeySection.classList.add("hidden");
    generatorSection.classList.remove("hidden");
  }
  // Load saved handles
  leetcodeHandleInput.value = localStorage.getItem("leetcodeHandle") || "";
  codeforcesHandleInput.value = localStorage.getItem("codeforcesHandle") || "";

  // Load last generated sheets for persistence
  const savedSheets = localStorage.getItem("lastGeneratedSheets");
  const savedTopic = localStorage.getItem("lastTopic");
  if (savedSheets && savedTopic) {
    topicInput.value = savedTopic;
    sheetsContainer.innerHTML = savedSheets;
  }
});

// --- Event Listeners ---
saveApiKeyButton.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (key) {
    localStorage.setItem("geminiApiKey", key);
    geminiApiKey = key;
    apiKeySection.classList.add("hidden");
    generatorSection.classList.remove("hidden");
    apiKeyError.classList.add("hidden");
  } else {
    apiKeyError.classList.remove("hidden");
  }
});

resetApiKeyButton.addEventListener("click", () => {
  localStorage.removeItem("geminiApiKey");
  localStorage.removeItem("lastGeneratedSheets");
  localStorage.removeItem("lastTopic");
  geminiApiKey = "";
  generatorSection.classList.add("hidden");
  apiKeySection.classList.remove("hidden");
  apiKeyInput.value = "";
  sheetsContainer.innerHTML = "";
});

loadSolvedButton.addEventListener("click", fetchAllSolvedProblems);
generateSheetsButton.addEventListener("click", handleGenerateSheets);

// --- Core Functions ---

/**
 * Fetches solved problems from both LeetCode and Codeforces.
 */
async function fetchAllSolvedProblems() {
  setLoadingState(loadButtonText, loadLoader, loadSolvedButton, true);
  solvedStatus.textContent = "Fetching solved problems...";

  const leetcodeHandle = leetcodeHandleInput.value.trim();
  const codeforcesHandle = codeforcesHandleInput.value.trim();

  localStorage.setItem("leetcodeHandle", leetcodeHandle);
  localStorage.setItem("codeforcesHandle", codeforcesHandle);

  solvedLeetCode.clear();
  solvedCodeforces.clear();

  const promises = [];
  if (leetcodeHandle) promises.push(fetchLeetCodeSolved(leetcodeHandle));
  if (codeforcesHandle) promises.push(fetchCodeforcesSolved(codeforcesHandle));

  await Promise.all(promises);

  let statusMessages = [];
  if (leetcodeHandle)
    statusMessages.push(`${solvedLeetCode.size} LeetCode solved`);
  if (codeforcesHandle)
    statusMessages.push(`${solvedCodeforces.size} Codeforces solved`);

  solvedStatus.textContent =
    statusMessages.length > 0
      ? `Loaded: ${statusMessages.join(", ")}.`
      : "Enter a handle to load solved problems.";

  setLoadingState(loadButtonText, loadLoader, loadSolvedButton, false);
}

/**
 * Fetches solved problems from the Codeforces API.
 */
async function fetchCodeforcesSolved(handle) {
  try {
    const response = await fetch(
      `https://codeforces.com/api/user.status?handle=${handle}&from=1`
    );
    if (!response.ok) throw new Error("Network response was not ok");
    const data = await response.json();
    if (data.status === "OK") {
      data.result
        .filter((sub) => sub.verdict === "OK")
        .forEach((sub) => {
          const problemId = `${sub.problem.contestId}-${sub.problem.index}`;
          solvedCodeforces.add(problemId);
        });
    } else {
      throw new Error(data.comment);
    }
  } catch (error) {
    console.error("Failed to fetch Codeforces data:", error);
    solvedStatus.textContent = `Error fetching Codeforces data for ${handle}.`;
  }
}

/**
 * Fetches solved problems from LeetCode with a retry mechanism.
 */
async function fetchLeetCodeSolved(handle) {
  const apiUrl = `https://alfa-leetcode-api.onrender.com/${handle}/solved`;
  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt} to fetch LeetCode data for ${handle}...`);
      const response = await fetch(apiUrl);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`User '${handle}' not found.`);
        }
        throw new Error(`API returned status ${response.status}.`);
      }

      const data = await response.json();

      if (data.solvedProblem && Array.isArray(data.solvedProblem)) {
        data.solvedProblem.forEach((problem) => {
          if (problem.titleSlug) {
            solvedLeetCode.add(problem.titleSlug);
          }
        });
        console.log(
          `Successfully fetched ${solvedLeetCode.size} solved LeetCode problems for ${handle}.`
        );
        return; // Success, so we exit the function.
      } else {
        throw new Error("Invalid data structure from LeetCode API.");
      }
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error);
      lastError = error;
      // Wait 2 seconds before the next retry, but not after the last one.
      if (attempt < maxRetries) {
        await new Promise((res) => setTimeout(res, 2000));
      }
    }
  }

  // If all retries failed, update the UI with the last known error.
  solvedStatus.textContent = `Error fetching LeetCode data: ${lastError.message}. The API might be down.`;
}

/**
 * Handles the main sheet generation logic.
 */
async function handleGenerateSheets() {
  const topic = topicInput.value.trim();
  if (!topic) {
    alert("Please enter a topic.");
    return;
  }

  setLoadingState(
    generateButtonText,
    generateLoader,
    generateSheetsButton,
    true
  );
  sheetsContainer.innerHTML = ""; // Clear previous results before generating new ones

  // Add a random seed to the prompt to ensure a different sheet is generated each time.
  const randomSeed = Math.floor(Math.random() * 10000);

  const prompts = [
    {
      type: "leetcode",
      title: "LeetCode - Most Accepted",
      prompt: `Generate a list of 50 LeetCode problems on "${topic}". Use random seed ${randomSeed} to ensure variety. Sort by difficulty (Easy, Medium, Hard), then by highest acceptance rate. Provide name, difficulty, URL, and the unique titleSlug.`,
    },
    {
      type: "leetcode",
      title: "LeetCode - Less Accepted",
      prompt: `Generate a list of 50 LeetCode problems on "${topic}". Use random seed ${randomSeed} to ensure variety. Sort by difficulty (Easy, Medium, Hard), then by lowest acceptance rate. Provide name, difficulty, URL, and the unique titleSlug.`,
    },
    {
      type: "codeforces",
      title: "Codeforces - Most Solved",
      prompt: `Generate a list of 50 Codeforces problems on "${topic}". Use random seed ${randomSeed} to ensure variety. Sort by rating (lowest to highest). Pick the most solved problems. Provide name, rating, URL, and a unique ID (contestId-index).`,
    },
    {
      type: "codeforces",
      title: "Codeforces - Less Solved",
      prompt: `Generate a list of 50 Codeforces problems on "${topic}". Use random seed ${randomSeed} to ensure variety. Sort by rating (lowest to highest). Pick the least solved problems. Provide name, rating, URL, and a unique ID (contestId-index).`,
    },
  ];

  try {
    const sheetPromises = prompts.map((p) =>
      generateSheet(p.prompt, p.title, p.type)
    );
    await Promise.all(sheetPromises);
    // Persist the generated sheets to local storage after all are loaded
    localStorage.setItem("lastGeneratedSheets", sheetsContainer.innerHTML);
    localStorage.setItem("lastTopic", topic);
  } catch (error) {
    console.error("Error generating sheets:", error);
    alert("An error occurred. Check your API key and console.");
  } finally {
    setLoadingState(
      generateButtonText,
      generateLoader,
      generateSheetsButton,
      false
    );
  }
}

/**
 * Calls the Gemini API to generate a single sheet and renders it.
 */
async function generateSheet(prompt, title, type) {
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${geminiApiKey}`;
  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          problems: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING" },
                difficulty_or_rating: { type: "STRING" },
                url: { type: "STRING" },
                unique_id: {
                  type: "STRING",
                  description:
                    "LeetCode titleSlug or Codeforces contestId-index",
                },
              },
              required: ["name", "difficulty_or_rating", "url", "unique_id"],
            },
          },
        },
        required: ["problems"],
      },
    },
  };

  const card = createSheetCard(title);
  sheetsContainer.appendChild(card);
  const listElement = card.querySelector("ul");
  const errorElement = card.querySelector("p");

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${errorData.error.message}`);
    }
    const result = await response.json();
    const data = JSON.parse(result.candidates[0].content.parts[0].text);

    if (data.problems && data.problems.length > 0) {
      listElement.innerHTML = ""; // Clear loader
      data.problems.forEach((problem) => {
        const li = document.createElement("li");
        li.className =
          "flex justify-between items-center py-2 border-b border-gray-700";

        // Check if the problem is solved
        const isSolved =
          (type === "leetcode" && solvedLeetCode.has(problem.unique_id)) ||
          (type === "codeforces" && solvedCodeforces.has(problem.unique_id));

        if (isSolved) {
          li.classList.add("solved-problem");
        }

        li.innerHTML = `
                    <a href="${problem.url}" target="_blank" rel="noopener noreferrer" class="hover:underline flex-1 truncate pr-4">${problem.name}</a>
                    <span class="text-sm font-medium text-gray-400">${problem.difficulty_or_rating}</span>
                `;
        listElement.appendChild(li);
      });
    } else {
      throw new Error("No problems found in the response.");
    }
  } catch (error) {
    console.error(`Error for "${title}":`, error);
    listElement.classList.add("hidden");
    errorElement.classList.remove("hidden");
    errorElement.textContent = `Failed to load sheet. ${error.message}`;
  }
}

// --- UI Helper Functions ---
function setLoadingState(textElement, loaderElement, buttonElement, isLoading) {
  if (isLoading) {
    textElement.classList.add("hidden");
    loaderElement.classList.remove("hidden");
    buttonElement.disabled = true;
  } else {
    textElement.classList.remove("hidden");
    loaderElement.classList.add("hidden");
    buttonElement.disabled = false;
  }
}

function createSheetCard(title) {
  const card = document.createElement("div");
  card.className = "bg-gray-800 p-6 rounded-lg shadow-lg flex flex-col";
  card.innerHTML = `
        <h2 class="text-xl font-bold mb-4 text-cyan-300">${title}</h2>
        <div class="flex-grow overflow-y-auto" style="max-height: 400px;">
            <ul class="space-y-2">
                <li class="flex items-center justify-center h-full text-gray-400">
                    <div class="loader ease-linear rounded-full border-4 border-t-4 border-gray-200 h-8 w-8"></div>
                </li>
            </ul>
            <p class="text-red-400 text-center hidden">Failed to load sheet.</p>
        </div>
    `;
  return card;
}
