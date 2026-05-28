const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { v4: uuidv4 } = require("uuid");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Importer les agents
const marketScout = require("./agents/market-scout.js");
const appArchitect = require("./agents/app-architect.js");
const logoGen = require("./agents/logo-gen.js");
const codeGen = require("./agents/code-gen.js");
const screenshots = require("./agents/screenshots.js");
const aso = require("./agents/aso.js");
const compliance = require("./agents/compliance.js");
const buildDeploy = require("./agents/build-deploy.js");

// Routes pour chaque agent
app.post("/api/agents/market-scout", async (req, res) => {
  try {
    const { appIdea } = req.body;
    const result = await marketScout.execute(appIdea);
    res.json({ status: "success", data: result });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.post("/api/agents/app-architect", async (req, res) => {
  try {
    const { appIdea, marketData } = req.body;
    const result = await appArchitect.execute(appIdea, marketData);
    res.json({ status: "success", data: result });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.post("/api/agents/logo-gen", async (req, res) => {
  try {
    const { appIdea, appName, colors } = req.body;
    const result = await logoGen.execute(appIdea, appName, colors);
    res.json({ status: "success", data: result });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.post("/api/agents/code-gen", async (req, res) => {
  try {
    const { appName, architecture, features } = req.body;
    const result = await codeGen.execute(appName, architecture, features);
    res.json({ status: "success", data: result });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.post("/api/agents/screenshots", async (req, res) => {
  try {
    const { codeSnapshot, appName } = req.body;
    const result = await screenshots.execute(codeSnapshot, appName);
    res.json({ status: "success", data: result });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.post("/api/agents/aso", async (req, res) => {
  try {
    const { appIdea, appName } = req.body;
    const result = await aso.execute(appIdea, appName);
    res.json({ status: "success", data: result });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.post("/api/agents/compliance", async (req, res) => {
  try {
    const { appName, appId, features } = req.body;
    const result = await compliance.execute(appName, appId, features);
    res.json({ status: "success", data: result });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.post("/api/agents/build-deploy", async (req, res) => {
  try {
    const { appName, appId, codePath } = req.body;
    const result = await buildDeploy.execute(appName, appId, codePath);
    res.json({ status: "success", data: result });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Route pour lancer toute la pipeline
app.post("/api/pipeline/execute-full", async (req, res) => {
  try {
    const { appIdea } = req.body;
    const pipelineId = uuidv4();

    // Exécuter tous les agents en séquence
    const market = await marketScout.execute(appIdea);
    const arch = await appArchitect.execute(appIdea, market);
    const logo = await logoGen.execute(appIdea, arch.appName, arch.theme);
    const code = await codeGen.execute(arch.appName, arch, market);
    const shots = await screenshots.execute(code, arch.appName);
    const listing = await aso.execute(appIdea, arch.appName);
    const policy = await compliance.execute(
      arch.appName,
      arch.packageId,
      arch.features,
    );
    const final = await buildDeploy.execute(arch.appName, arch.packageId, code);

    res.json({
      status: "success",
      pipelineId,
      results: {
        market,
        arch,
        logo,
        code,
        shots,
        listing,
        policy,
        final,
      },
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
