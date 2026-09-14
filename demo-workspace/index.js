// Hello World Sample App for AURIX Scan Verification
const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Hello World! AURIX Security Scan Test Application.");
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
