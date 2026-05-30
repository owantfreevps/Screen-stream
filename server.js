const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const jwt = require("jsonwebtoken");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const SECRET = "super_secret_key";
const PASSWORD = "1234";

let agents = new Map();
let viewers = new Set();

app.use(express.json());
app.use(express.static("public"));

// 🔐 login -> JWT
app.post("/login", (req, res) => {
    const { password } = req.body;

    if (password === PASSWORD) {
        const token = jwt.sign({ user: "admin" }, SECRET, { expiresIn: "1h" });
        return res.json({ token });
    }

    res.status(401).json({ error: "wrong password" });
});

function verify(token) {
    try {
        return jwt.verify(token, SECRET);
    } catch {
        return null;
    }
}

function sendDevices() {
    const list = Array.from(agents.keys());

    viewers.forEach(v => {
        if (v.readyState === WebSocket.OPEN) {
            v.send(JSON.stringify({ type: "devices", list }));
        }
    });
}

wss.on("connection", (ws) => {

    ws.on("message", (msg) => {

        if (Buffer.isBuffer(msg)) {
            if (ws.role === "agent") {
                viewers.forEach(v => {
                    if (v.readyState === WebSocket.OPEN) {
                        v.send(msg);
                    }
                });
            }
            return;
        }

        let data;
        try {
            data = JSON.parse(msg);
        } catch {
            return;
        }

        // AUTH
        if (data.type === "auth") {

            const user = verify(data.token);

            if (!user) {
                ws.send(JSON.stringify({ type: "auth_fail" }));
                ws.close();
                return;
            }

            ws.role = data.role;

            if (data.role === "agent") {
                ws.id = data.id;
                agents.set(ws.id, ws);
                sendDevices();
            }

            if (data.role === "viewer") {
                viewers.add(ws);
            }

            ws.send(JSON.stringify({ type: "auth_ok" }));
        }
    });

    ws.on("close", () => {
        viewers.delete(ws);

        if (ws.role === "agent") {
            agents.delete(ws.id);
            sendDevices();
        }
    });
});

server.listen(process.env.PORT || 3000, () => {
    console.log("Server running");
});
