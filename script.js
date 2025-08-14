// Wait for the HTML document to be fully loaded before running the script
document.addEventListener("DOMContentLoaded", () => {
  // Get references to all the necessary HTML elements
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

  let geminiApiKey = "";

  // Check for a saved API key in local storage when the page loads
  const savedKey = localStorage.getItem("geminiApiKey");
  if (savedKey) {
    geminiApiKey = savedKey;
    apiKeySection.classList.add("hidden"); // Hide the API key form
    generatorSection.classList.remove("hidden"); // Show the generator form
  }

  // Event listener for the "Save and Continue" button
  saveApiKeyButton.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    if (key) {
      localStorage.setItem("geminiApiKey", key); // Save the key to local storage
      geminiApiKey = key;
      apiKeySection.classList.add("hidden");
      generatorSection.classList.remove("hidden");
      apiKeyError.classList.add("hidden");
    } else {
      apiKeyError.classList.remove("hidden"); // Show error if key is empty
    }
  });

  // Event listener for the "Change API Key" button
  resetApiKeyButton.addEventListener("click", () => {
    localStorage.removeItem("geminiApiKey"); // Remove key from storage
    geminiApiKey = "";
    generatorSection.classList.add("hidden"); // Hide generator
    apiKeySection.classList.remove("hidden"); // Show API key form
    apiKeyInput.value = "";
    sheetsContainer.innerHTML = ""; // Clear any existing sheets
  });

  // Event listener for the "Generate" button
  generateSheetsButton.addEventListener("click", async () => {
    const topic = topicInput.value.trim();
    if (!topic) {
      alert("Please enter a topic.");
      return;
    }

    setLoading(true); // Show loading indicator
    sheetsContainer.innerHTML = ""; // Clear previous results

    // Define the four different prompts for the Gemini API
    const prompts = [
      {
        title: "LeetCode - Most Accepted",
        prompt: `Generate a list of 50 LeetCode problems on the topic "${topic}". The list must be sorted by difficulty from easy to hard. Within each difficulty, the problems must be sorted by the highest acceptance rate. Provide the problem name, its difficulty, and a direct URL.`,
      },
      {
        title: "LeetCode - Less Accepted",
        prompt: `Generate a list of 50 LeetCode problems on the topic "${topic}". The list must be sorted by difficulty from easy to hard. Within each difficulty, the problems must be sorted by the lowest acceptance rate. Provide the problem name, its difficulty, and a direct URL.`,
      },
      {
        title: "Codeforces - Most Solved",
        prompt: `Generate a list of 50 Codeforces problems on the topic "${topic}". The list must be sorted by rating from lowest to highest. The problems should be the most solved ones for the given topic. Provide the problem name, its rating, and a direct URL.`,
      },
      {
        title: "Codeforces - Less Solved",
        prompt: `Generate a list of 50 Codeforces problems on the topic "${topic}". The list must be sorted by rating from lowest to highest. The problems should be the least solved ones for the given topic. Provide the problem name, its rating, and a direct URL.`,
      },
    ];

    try {
      // Create an array of promises, one for each API call
      const sheetPromises = prompts.map((p) =>
        generateSheet(p.prompt, p.title)
      );
      // Wait for all promises to resolve
      await Promise.all(sheetPromises);
    } catch (error) {
      console.error("Error generating sheets:", error);
      alert(
        "An error occurred while generating the sheets. Please check your API key and the console for more details."
      );
    } finally {
      setLoading(false); // Hide loading indicator
    }
  });

  // Function to control the loading state of the "Generate" button
  function setLoading(isLoading) {
    if (isLoading) {
      generateButtonText.classList.add("hidden");
      generateLoader.classList.remove("hidden");
      generateSheetsButton.disabled = true;
    } else {
      generateButtonText.classList.remove("hidden");
      generateLoader.classList.add("hidden");
      generateSheetsButton.disabled = false;
    }
  }

  // Function to call the Gemini API and render the results
  async function generateSheet(prompt, title) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${geminiApiKey}`;

    // Define the structure of the expected JSON response
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
                  name: {
                    type: "STRING",
                    description: "The name of the problem.",
                  },
                  difficulty_or_rating: {
                    type: "STRING",
                    description:
                      "The difficulty (e.g., Easy, Medium, Hard) or rating (e.g., 1200) of the problem.",
                  },
                  url: {
                    type: "STRING",
                    description: "The direct URL to the problem.",
                  },
                },
                required: ["name", "difficulty_or_rating", "url"],
              },
            },
          },
          required: ["problems"],
        },
      },
    };

    // Create a placeholder card for the sheet while it loads
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
      const text = result.candidates[0].content.parts[0].text;
      const data = JSON.parse(text);

      if (data.problems && data.problems.length > 0) {
        listElement.innerHTML = ""; // Clear loading spinner
        // Populate the list with the problems from the API response
        data.problems.forEach((problem) => {
          const li = document.createElement("li");
          li.className =
            "flex justify-between items-center py-2 border-b border-gray-700";
          li.innerHTML = `
                        <a href="${problem.url}" target="_blank" rel="noopener noreferrer" class="text-cyan-400 hover:underline flex-1 truncate pr-4">${problem.name}</a>
                        <span class="text-sm font-medium text-gray-400">${problem.difficulty_or_rating}</span>
                    `;
          listElement.appendChild(li);
        });
      } else {
        throw new Error("No problems found in the response.");
      }
    } catch (error) {
      console.error(`Error generating sheet for "${title}":`, error);
      listElement.classList.add("hidden");
      errorElement.classList.remove("hidden");
      errorElement.textContent = `Failed to load sheet. ${error.message}`;
    }
  }

  // Function to create the card element for each sheet
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
});
