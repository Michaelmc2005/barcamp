// dependencies
const express = require("express");
const fs = require("fs");
const app = express();
const http = require("http");
const server = http.createServer(app);
const PORT = 3000;


const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.json());
app.use(express.static("."));

let orgContacts = [];
let messages = [];

const userSockets = {};

// read in curernt users
if (fs.existsSync("orgcontacts.json")) {
  orgContacts = JSON.parse(fs.readFileSync("orgcontacts.json"));
}

// register a new user
app.post("/register", (req, res) => {
  const { username, publicKey } = req.body;
  orgContacts = orgContacts.filter((user) => user.username !== username);
  orgContacts.push({ username, publicKey });
  fs.writeFileSync("orgcontacts.json", JSON.stringify(orgContacts, null, 2));
  res.sendStatus(200);
});

// get the list of users
app.get("/users", (req, res) => {
  const usernames = orgContacts.map((user) => user.username);
  res.json(usernames);
});

// get a user's public key
app.get("/publicKey/:username", (req, res) => {
  const user = orgContacts.find((u) => u.username === req.params.username);
  if (user) {
    res.json({ publicKey: user.publicKey });
  } else {
    res.status(404).send("User not found");
  }
});


// get messages for a user
app.get("/messages/:username", (req, res) => {
  const userMessages = messages.filter(
    (msg) =>
      (msg.recipient === req.params.username && msg.delivered) ||
      (msg.sender === req.params.username)
  );
  res.json(userMessages);
});

// connection handler
io.on("connection", (socket) => {
  console.log("A user connected");

  // register the user and store socketID
  socket.on("register", ({ username }) => {
    userSockets[username] = socket.id;
    socket.username = username;
    console.log(`${username} registered with socket ID ${socket.id}`);

    // save messages when user is outside the current chat
    const undeliveredMessages = messages.filter(
      (msg) => msg.recipient === username && !msg.delivered
    );
    undeliveredMessages.forEach((msg) => {
      io.to(socket.id).emit("newMessage", { sender: msg.sender, message: msg.message });
      msg.delivered = true; 
    });
  });

  // incoming messages socket
  socket.on("sendMessage", (data) => {
    const { sender, recipient, message } = data;

    // save message to array
    messages.push({ sender, recipient, message, delivered: false });

    // Find the socket ID of the recipient and emit the message
    const recipientSocketId = userSockets[recipient];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("newMessage", { sender, message });
      // mark as delivered
      messages = messages.map((msg) =>
        msg.sender === sender && msg.recipient === recipient && msg.message === message
          ? { ...msg, delivered: true }
          : msg
      );
    } else {
      // handle messages saved
      console.log(`User ${recipient} is offline. Message stored for later delivery.`);
    }
  });

  socket.on("disconnect", () => {
    if (socket.username) {
      delete userSockets[socket.username];
    }
    console.log("A user disconnected");
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
