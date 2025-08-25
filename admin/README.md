To protect your OS, start a virtual environment for your webroot, and another for Claude Code CLL.


Run a web server within a virtual environment on port 8887:

On Macs:

	python3 -m venv env
	source env/bin/activate
	python -m http.server 8887

On Windows:

	python -m venv env
	env\Scripts\activate
	python -m http.server 8887

Fork and clone the webroot repo from [Github.com/ModelEarth](https://github.com/ModelEarth/webroot/) (for developers) or [Github.com/PartnerTools](https://github.com/PartnerTools/webroot/) (for stable hosting).

Then start your local <a href="server/">Rust API and database connections</a>