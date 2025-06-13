let keyword = "HOOP";
let caseSensitive = true;

/* MAKE NO CHANGES BELOW THIS LINE */
let input = "";
let pasteTimeout = null;
const delayMs = 300;
const fs = require("fs");
const path = require("path");
const RETENTION_DAYS = 30;

const express = require("express");
const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.static("public"));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});

app.post('/filter', (req, res) => {
  try {
    const { rawJson, keyword: submittedKeyword, caseSensitive } = req.body;
    const parsed = JSON.parse(rawJson);

    const queryWord = caseSensitive ? submittedKeyword : submittedKeyword.toLowerCase();
    const items = parsed._embedded?.items || [];
    const filtered = items.filter(item => containsKeyword(item, queryWord, caseSensitive));

    if (filtered.length === 0) {
      return res.send(`⚠️ No matches found for '${queryWord}'`);
    }

    const now = new Date();
    const folderName = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const folderPath = path.join(__dirname, folderName);

    // Create the folder if missing
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath);
    }

    // Dynamically expose the folder (once only)
    // Safely mount if not already served
    try {
      if (Array.isArray(app._router?.stack)) {
        const alreadyMounted = app._router.stack.some(
          r => r?.route?.path === `/${folderName}` || r?.regexp?.toString().includes(folderName)
        );

        if (!alreadyMounted) {
          app.use(`/${folderName}`, express.static(folderPath));
        }
      } else {
        app.use(`/${folderName}`, express.static(folderPath));
      }
    } catch (e) {
      // Fallback: just serve it anyway if something weird happens
      app.use(`/${folderName}`, express.static(folderPath));
    }


    const timestamp = getLocalTimeForFilename(); // HH-MM-SS.sss
    const filename = `${timestamp}_${submittedKeyword}.json`;
    const filePath = path.join(folderPath, filename);

    const result = {
      count: filtered.length,
      _embedded: { items: filtered }
    };

    //fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
    console.log(`✅ File written to: ${filePath}`);
    console.log(`✅ Folder exists: ${fs.existsSync(folderPath)}`);
    console.log(`✅ File exists: ${fs.existsSync(filePath)}`);

    const fileUrl = `/${folderName}/${filename}`;
    const summary = [
      `✅ ${filtered.length} match${filtered.length === 1 ? '' : 'es'} for '${queryWord}':`,
      ...filtered.map(item => '  ' + item.name),
      `<br><br>📁 JSON output saved in <a href="${fileUrl}" target="_blank">${folderName}/${filename}</a>`

    ].join('<br>');

    res.send(summary);

  } catch (err) {
    res.status(400).send('❌ Invalid JSON: ' + err.message);
  }
});


process.stdin.setEncoding("utf-8");

process.stdin.on("data", (chunk) => {
  input += chunk;

  clearTimeout(pasteTimeout);
  pasteTimeout = setTimeout(() => {
    try {
      const testParse = JSON.parse(input); // only proceeds if valid
      processInput(input);
      input = ""; // Clear buffer after successful parse
    } catch (err) {
      // Still waiting for full paste... do nothing yet
    }
  }, delayMs);
});

// Recursive keyword search
function containsKeyword(obj, queryWord, caseSensitive) {
  if (typeof obj === "string") {
    return caseSensitive
      ? obj.includes(queryWord)
      : obj.toLowerCase().includes(queryWord.toLowerCase());
  } else if (Array.isArray(obj)) {
    return obj.some((item) => containsKeyword(item, queryWord, caseSensitive));
  } else if (typeof obj === "object" && obj !== null) {
    return Object.values(obj).some((value) =>
      containsKeyword(value, queryWord, caseSensitive),
    );
  }
  return false;
}

// Main processing logic
function processInput(input) {
  try {
    cleanupOldFolders();
    const parsed = JSON.parse(input);
    console.clear();

    const queryWord = caseSensitive ? keyword : keyword.toLowerCase();
    const items = parsed._embedded?.items || [];
    const filtered = items.filter((item) =>
      containsKeyword(item, queryWord, caseSensitive),
    );

    if (filtered.length === 0) {
      console.log(
        `\n⚠️ No matches found for '${queryWord}' (${caseSensitive ? "case-sensitive" : "case-insensitive"}). File output skipped.`,
      );
      return;
    }

    const result = {
      count: filtered.length,
      _embedded: {
        items: filtered,
      },
    };

    // Create date-named folder
    const today = new Date();
    const folderName = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const folderPath = `./${folderName}`;

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath);
    }

    // Filename only has time and keyword
    const filename = `${getLocalTimeForFilename()}_${keyword}.json`;
    const filePath = `${folderPath}/${filename}`;

    fs.writeFileSync(filePath, JSON.stringify(result, null, 2), "utf-8");

    // Minimal console output
    console.log(
      `\n✅ ${filtered.length} match${filtered.length === 1 ? "" : "es"} for '${queryWord}' (${caseSensitive ? "case-sensitive" : "case-insensitive"}):`,
    );
    filtered.forEach((item) => console.log("  " + item.name));
    console.log(`\n📁 Full output written to file: ${filePath}`);
    console.log("\n".repeat(40)); // Push console to bottom
    console.log("🔽 End of summary 🔽");
  } catch (err) {
    console.error("❌ Invalid JSON input:", err.message);
  }
}

//Localized TZ
function getLocalTimeForFilename() {
  const now = new Date();
  const parts = now
    .toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "America/Phoenix",
    })
    .split(":");

  const hour = parts[0];
  const minute = parts[1];
  const second = parts[2];
  const ms = now.getMilliseconds().toString().padStart(3, "0");

  return `${hour}-${minute}-${second}.${ms}`;
}

function cleanupOldFolders(basePath = ".") {
  const folderRegex = /^\d{4}-\d{2}-\d{2}$/;
  const now = new Date();

  // Normalize to midnight local time
  now.setHours(0, 0, 0, 0);

  fs.readdirSync(basePath, { withFileTypes: true }).forEach((entry) => {
    if (entry.isDirectory() && folderRegex.test(entry.name)) {
      const [year, month, day] = entry.name.split("-").map(Number);
      const folderDate = new Date(year, month - 1, day); // local midnight

      const ageDays = Math.floor((now - folderDate) / (1000 * 60 * 60 * 24));

      if (ageDays > RETENTION_DAYS) {
        const fullPath = path.join(basePath, entry.name);
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(
          `🧹 Deleted old folder: ${entry.name} (age: ${ageDays} days)`,
        );
      }
    }
  });
}
