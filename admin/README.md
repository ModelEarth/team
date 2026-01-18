To protect your OS, start a virtual environment for your webroot, and another for Claude Code CLL.


Run a web server within a virtual environment on port 8887:

On Macs and Linux:

	../../desktop/install/quickstart.sh --cli

On Windows:

	..\..\desktop\install\quickstart.sh --cli

**About the quickstart.sh script:**
- Automatically creates a virtual environment in `desktop/install/env/` if it doesn't exist
- Activates the virtual environment
- Checks for Claude API key configuration in `docker/.env`
- Installs the `anthropic` package if API key is configured
- Starts the Python HTTP server with server-side execution access via server.py on port 8887

**Alternative (basic HTTP server without server-side Python execution):**

	python -m http.server 8887

Note: The basic python server above does not include virtual environment isolation or server-side execution capabilities.

Fork and clone the webroot repo from [Github.com/ModelEarth](https://github.com/ModelEarth/webroot/) (for developers) or [Github.com/PartnerTools](https://github.com/PartnerTools/webroot/) (for stable hosting).

Then start your local <a href="server/">Rust API and database connections</a>