### 🛡️ Run Claude Code CLL

Inside the claude cmd window, start your local Rust API server by running:
(Maybe you can simply type "Start server")

	nohup cargo run -- serve > server.log 2>&1 &

The above keeps the server running and also stores logs,
whereas `cargo run -- serve` doesn't remain running inside the CLI.

View the website locally at: [localhost:8887/team](http://localhost:8887/team/)

<!--
  # Check if server is running
  curl http://localhost:8081/api/health

  # Stop the background server
  lsof -ti:8081 | xargs kill -9

  # View server logs
  tail -f server.log
-->