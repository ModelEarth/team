# Team Repo

### Team Project Collaboration Platform

The `team` repo is a submodule inside each site's `webroot` and provides a JAM Stack toolset for sites implementing Rust REST API backends with AI-powered insights. Our goal is to connect site users with developers, designers, and innovators to collaborate on coding projects focused on skill training, job creation and environmental improvement.

## 🌟 Key Features/Goals

### Project Management
- **Post Activities**: Integrate project postings and collaboration requests
- **Smart Discovery**: AI-powered project search with natural language queries
- **Task Tracking**: Manage to-dos with Github PLAN.md integration and PRs
- **Timeline Views**: Visual project timelines and milestone tracking

### Team Collaboration
- **People Directory**: Connect with developers, designers, and project leaders
- **Team Formation**: Create and join focused development teams
- **Organization Network**: Connect with verified organizations and content partners
- **Skills Matching**: AI-powered matching based on technical skills and interests

### AI-Powered Insights
- **Smart Search**: Natural language search powered by Google Gemini AI
- **Project Recommendations**: Personalized project suggestions based on skills and interests
- **Data Analysis**: Smart insights for team and project performance
- **Policy Matching**: Connect with projects aligned to your policy preferences

### Personal Profiles
- **Skills Portfolio**: Showcase technical expertise with visual skill levels
- **Interest Ratings**: 5-star rating system for 20+ focus areas
- **Policy Preferences**: Comprehensive survey with Sankey chart visualizations
- **Certification Tracking**: Verified badges and achievements

## 🚀 Technology Stack

### Frontend (JAM Stack)
- **HTML5/CSS3**: Modern, semantic markup with CSS Grid and Flexbox
- **Vanilla JavaScript**: No build process required - runs directly in browser
- **Responsive Design**: Mobile-first design with smooth animations
- **Notion-Inspired UI**: Clean, minimal aesthetic with soft shadows and gradients

### Backend (Rust)
- **Actix-web**: High-performance web framework
- **SQLx**: Async PostgreSQL database toolkit
- **Insight AI Endpoints**: Multiple LLMs for smart search and insights
- **JWT Authentication**: Secure token-based authentication

### Database
- **PostgreSQL**: Production-ready relational database
- **SuiteCRM Schema**: Compatible with Salesforce/Dynamics table structure
- **Azure/Google Cloud**: Cloud-ready database configuration

## 📁 Project Structure

```
team/
├── index.html                 # Main application file
├── css/                       # Stylesheets
│   ├── projects.css           # Project management styles
│   ├── people-teams.css       # People & teams styles
│   └── account.css            # Account & survey styles
├── js/                        # JavaScript modules
│   ├── projects.js            # Project management functionality
│   └── survey.js              # Survey & skills management
├── config/                    # Legacy frontend config (being retired)
│   └── settings.example.js    # Deprecated - see PLAN.md
├── src/                       # Rust backend source
│   └── main.rs                # Main server application
├── sql/                       # Database schema
│   └── suitecrm-postgres.sql
└── projects/                  # Team and list tools, meetup integration
    └── edit.html
```

## 🎨 Design Philosophy

### Notion-Inspired Aesthetic
- **Clean & Minimal**: Uncluttered interface focusing on content
- **Soft Color Palette**: Light green, pastel blue, muted orange accents
- **Smooth Animations**: Subtle transitions and hover effects
- **Professional Typography**: Inter font family with consistent hierarchy

### User Experience
- **Collapsible Navigation**: Smooth sidebar with icon tooltips
- **Responsive Design**: Optimized for desktop, tablet, and mobile
- **Accessibility**: WCAG compliant with keyboard navigation support
- **Progressive Enhancement**: Works without JavaScript for core features

## 🛠️ Setup Instructions

### Prerequisites
- Rust 1.70+ with Cargo
- PostgreSQL 12+
- (Optional/Free) Google Gemini AI API key

### Backend Setup

1. **Use the site webroot that contains `team/` as a submodule**
   ```bash
   cd <site-webroot>
   git submodule update --init --recursive team
   cd team
   ```

2. **Configure shared environment in webroot**
   ```bash
   cd ..
   cp docker/.env.example docker/.env
   # Edit docker/.env with database and OAuth values
   cd team
   ```

3. **Set up database**

The SQL schema is based on [SuiteCRM SQL (/profile/crm)](/profile/crm)

   ```bash
   # Create PostgreSQL database
   createdb IndustryDB
   
   # Run schema setup
   psql IndustryDB < sql/suitecrm-postgres.sql
   ```

4. **Configure environment variables**

Set `COMMONS_HOST` and related values in `../docker/.env`.

5. **Initialize database schema**
   ```bash
   cargo run -- init-db
   ```


6. **Start the backend server**
   ```bash
   cargo run -- serve
   ```
&nbsp; &nbsp; Or include the port by running:

   ```bash
      SERVER_PORT=8081 cargo run -- serve
   ```

### Frontend Setup

We recommend skipping 1 and open a server in your [webroot](../) instead.

1. **Serve the frontend**
   ```bash
   # Option 1: Simple HTTP server
   python -m http.server 3000
   
   # Option 2: Node.js serve
   npx serve .
   
   # Option 3: PHP server
   php -S localhost:3000
   ```

2. **Open in browser**
   ```
   http://localhost:8888
   ```

&nbsp; &nbsp; Or (recommended) open your webroot folder after running in your webroot (parent of the "team" folder):
   ```
   python -m http.server 8887
   ```
   
Then view here when coding (hit refresh after changing with an AI CLI above):

[http://localhost:8887/team/](http://localhost:8887/team/)


## 🔧 Configuration

### API Configuration
Update the API base URL in your frontend:
```javascript
const API_BASE = 'http://localhost:8081/api';
```

### Database Configuration
The application supports Azure and Google Cloud PostgreSQL:
```rust
// In Cargo.toml or environment variables
DATABASE_URL=postgresql://sqladmin@industry-server.database.windows.net/IndustryDB
```

### Authentication Providers
Configure OAuth providers in `docker/.env`:
- Google OAuth 2.0
- GitHub OAuth
- LinkedIn OAuth
- Email/password authentication

## 🚀 Usage

### For Developers
1. **Sign up** using Google, GitHub, LinkedIn, or email
2. **Complete your profile** with skills and interests
3. **Take the policy survey** to find aligned projects
4. **Browse opportunities** or use AI search to find projects
5. **Join teams** and collaborate on local innovation projects

### For Project Managers
1. **Post activities** with detailed requirements
2. **Recruit team members** based on skills and interests
3. **Track project progress** with built-in timelines
4. **Manage team collaboration** with integrated tools

### For Organizations
1. **Register your organization** and get verified
2. **Post funded opportunities** with Innovation Bond support
3. **Connect with local talent** through the directory
4. **Track impact metrics** across multiple projects

## 🎯 Target Audience

**Primary Users**: Vibe programmers, computer science and data science grads
**Use Cases**: 
- Government AI modernization projects
- Local community development initiatives
- Civic technology implementations
- Public-private partnership collaborations

## 🔮 AI Integration

### AI Features
- **Natural Language Search**: "Find JAM Stack developers in Atlanta working on AI projects"
- **Smart Recommendations**: Personalized project and team suggestions
- **Insight Generation**: Analysis of team dynamics and project progress
- **Content Enhancement**: AI-assisted project descriptions and requirements

### Implementation
```javascript
// Example AI search query
const aiResponse = await queryGeminiAI(`
    Based on this search: "${userQuery}"
    Find relevant projects matching:
    - Technical skills: ${userSkills}
    - Location: ${userLocation}
    - Interests: ${userInterests}
`);
```
