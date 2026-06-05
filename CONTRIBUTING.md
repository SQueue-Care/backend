# Contributing to Smart Healthcare Queue System

Welcome to the **Smart Healthcare Queue System** project! This document outlines how developers should contribute to this hospital queue management system.

## Table of Contents
- [Project Overview](#project-overview)
- [Getting Started](#getting-started)
- [Contributing Workflow](#contributing-workflow)
- [Development Setup](#development-setup)
- [Code Standards](#code-standards)
- [Testing](#testing)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Issue Management](#issue-management)

---

## Project Overview

This is an **Intelligent Hospital Queue Management System** developed for the 2026 Coding Camp powered by DBS Foundation. The system includes:

- **Frontend**: Patient portal & admin dashboard
- **Backend**: RESTful APIs for queue management
- **ML Model**: Wait time prediction system
- **Database**: Patient, doctor, schedule, and queue data management
- **Infrastructure**: Cloud deployment (Vercel, Render/Railway, Supabase/Neon)

---

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- Python (v3.8 or higher) - for ML model development
- Git
- GitHub account with access to [SQueue-Care organization](https://github.com/SQueue-Care)
- Postman or similar tool for API testing (optional)

### First-Time Setup
1. **Request access** to [SQueue-Care organization](https://github.com/SQueue-Care) if you don't have it
2. **Clone the repository** (use the specific repo for your area: fs, ds, or ai):
   ```bash
   # Example for full-stack repo
   git clone https://github.com/SQueue-Care/fs-repo.git
   cd fs-repo
   ```
3. **Set up git remotes** (optional, if you have a personal fork):
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/fs-repo.git
   git remote add upstream https://github.com/SQueue-Care/fs-repo.git
   ```
4. **Follow Development Setup section** below

---

## Contributing Workflow

### Step 1: Find or Create an Issue

#### Option A: Working on Existing Issues
1. Check the Issues board in your repository (fs, ds, or ai)
2. Look for issues with labels:
   - `fs` - Full Stack development tasks
   - `ds` - Data Science / ML tasks
   - `ai` - AI/ML model tasks

#### Option B: Reporting a Bug or Proposing a Feature
1. **Check existing issues** first to avoid duplicates
2. **Click "New Issue"** and choose a template:
   - **Bug Report**: Include steps to reproduce, expected/actual behavior
   - **Feature Request**: Explain the problem it solves and proposed solution
3. Wait for feedback from maintainers
4. Once approved, you can claim it

### Step 2: Set Up Your Development Branch

```bash
# Update your local develop branch (primary development branch)
git fetch origin
git checkout develop
git merge origin/develop

```

**Important:** Always develop from the **`develop`** branch, not `main`
- `develop` - Active development branch (integration point)
- `main` - Production-ready releases only

### Step 3: Development Setup

Follow the **Development Setup** section below to:
- Install dependencies
- Configure environment variables
- Set up databases (local or cloud)
- Run tests and validation

### Step 4: Make Your Changes

#### For Backend Changes:
1. Write code in the appropriate module
2. Add/update unit tests
3. Test your changes locally
4. Ensure API docs are updated if endpoints change

#### For Frontend Changes:
1. Follow React/component structure conventions
2. Add tests for new components
3. Ensure responsive design
4. Test in different browsers

#### For ML Model Changes:
1. Document model changes and accuracy metrics
2. Include training/evaluation scripts
3. Update prediction API if needed

### Step 5: Test Your Changes

```bash
# Run all tests
npm test          # Frontend tests
python -m pytest  # Backend tests

# Run linting
npm run lint      # Frontend linting
flake8 src/      # Backend linting

# Manual testing (if applicable)
# - Test in local environment
# - Use Postman for API endpoints
# - Create test cases
```

### Step 6: Commit Your Changes

```bash
git add .
git commit -m "feat: add queue optimization algorithm"
```

**Commit Message Format:**
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `style` - Code style changes (no logic change)
- `refactor` - Refactoring code
- `test` - Adding or updating tests
- `chore` - Dependency updates, build config

**Examples:**
```
feat(queue): add wait time prediction algorithm
fix(auth): resolve JWT token expiration issue
docs(api): update queue endpoint documentation
test(queue): add test cases for patient distribution
```

### Step 7: Push and Create a Pull Request

```bash
# Push your branch to origin
git push origin feature/queue-optimization

# Go to GitHub (https://github.com/SQueue-Care/[repo-name]) and create a Pull Request
# - Set base branch to 'develop' (NOT main)
# - Link the issue: "Fixes #123" or "Closes #123"
# - Fill in the PR template
# - Request reviews from maintainers
# - Add appropriate label: ds, fs, or ai
```

### Step 8: Address Review Feedback

1. **Read reviewer comments** carefully
2. **Make requested changes** locally
3. **Commit with descriptive messages**:
   ```bash
   git commit -m "refactor: improve queue sorting logic as per review"
   ```
4. **Push updates**:
   ```bash
   git push origin feature/queue-optimization
   ```
5. **Respond to comments** in the PR discussion
6. **Request re-review** when ready

### Step 9: Merge and Close

Once approved:
1. Maintainer will **merge your PR**
3. **Celebrate your contribution!** 🎉

---

## Development Setup

### 1. Install Dependencies

**Frontend:**
```bash
cd frontend
npm install
```

**Backend:**
```bash
cd backend
pip install -r requirements.txt
```

**ML Model (optional):**
```bash
cd ml
pip install -r requirements.txt
```

### 2. Environment Configuration

Create `.env` files in each directory:

**Frontend (.env):**
```
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_ML_API_URL=http://localhost:8000/api
```

**Backend (.env):**
```
DATABASE_URL=postgresql://user:password@localhost:5432/hospital_queue
JWT_SECRET=your_jwt_secret_key
ML_API_URL=http://localhost:8000/api
BPJS_API_URL=https://bpjs-mock-api.example.com
```

**ML Model (.env):**
```
MODEL_PORT=8000
DATABASE_URL=postgresql://user:password@localhost:5432/hospital_queue
```

### 3. Database Setup

**Local PostgreSQL:**
```bash
# Create database
createdb hospital_queue

# Run migrations (backend)
cd backend
python manage.py migrate
```

**Cloud Setup (Supabase/Neon):**
- Follow documentation at [Supabase](https://supabase.com) or [Neon](https://neon.tech)
- Set `DATABASE_URL` in `.env`

### 4. Run Development Servers

**Terminal 1 - Frontend:**
```bash
cd frontend
npm start
# Runs on http://localhost:3000
```

**Terminal 2 - Backend:**
```bash
cd backend
python manage.py runserver
# Runs on http://localhost:5000
```

**Terminal 3 - ML Model:**
```bash
cd ml
python app.py
# Runs on http://localhost:8000
```

### 5. Verify Setup

- Frontend: Visit http://localhost:3000
- Backend API: Visit http://localhost:5000/api/health
- ML API: Visit http://localhost:8000/api/health

---

## Code Standards

### General Standards
- **Readability**: Code should be self-explanatory; use meaningful variable names
- **DRY Principle**: Don't Repeat Yourself - reuse code where possible
- **Comments**: Add comments for complex logic, not obvious code
- **Naming Conventions**:
  - Variables/functions: `camelCase` (JavaScript), `snake_case` (Python)
  - Classes/Components: `PascalCase`
  - Constants: `UPPERCASE_WITH_UNDERSCORES`

### Frontend (React)
```javascript
// Good: Clear component name, functional component
const PatientQueueCard = ({ queueNumber, estimatedWaitTime }) => {
  return (
    <div className="queue-card">
      <h3>Queue #{queueNumber}</h3>
      <p>Wait time: {estimatedWaitTime} mins</p>
    </div>
  );
};

// Use hooks: useState, useEffect, useContext
// Keep components small and focused
// One component per file unless very small
```

### Backend (Python/FastAPI)
```python
# Good: Clear function name, type hints, docstring
def calculate_estimated_wait_time(queue_length: int, avg_service_time: float) -> float:
    """
    Calculate estimated wait time for a patient.
    
    Args:
        queue_length: Number of patients in queue
        avg_service_time: Average service time in minutes
        
    Returns:
        Estimated wait time in minutes
    """
    return queue_length * avg_service_time

# Use type hints
# Include docstrings for public functions/classes
# Keep functions focused on one responsibility
```

### ML Model (Python)
```python
# Document model architecture and training process
# Include model versioning and performance metrics
# Use clear variable names for model parameters
```

---

## Testing

### Frontend Testing
```bash
cd frontend

# Run tests
npm test

# Run with coverage
npm test -- --coverage

# E2E testing (if applicable)
npm run test:e2e
```

### Backend Testing
```bash
cd backend

# Run all tests
python -m pytest

# Run with coverage
python -m pytest --cov=.

# Run specific test
python -m pytest tests/test_queue.py
```

### Test Structure
- **Unit Tests**: Test individual functions/methods
- **Integration Tests**: Test multiple components working together
- **E2E Tests** (optional): Test full user workflows

---

## Commit Guidelines

### Before Committing
```bash
# Check what you're committing
git status
git diff

# Stage changes
git add .

# Review staged changes
git diff --cached
```

### Writing Commit Messages

**Good:**
```
feat(queue): implement wait time prediction using ML model

- Integrate FastAPI for ML predictions
- Cache predictions for 5 minutes
- Add error handling for model failures
```

**Bad:**
```
fixed stuff
update
changes
```

### Commit Best Practices
- **One logical change per commit** (not too big, not too small)
- **Descriptive messages** that explain the "why"
- **Reference issues**: "Fixes #123"
- **Break large changes** into multiple commits

---

## Pull Request Process

### Before Creating a PR
- [ ] Code follows project standards
- [ ] All tests pass locally
- [ ] No linting errors
- [ ] Updated relevant documentation
- [ ] Commit messages are clear and descriptive

### PR Title
```
[TYPE] Short description

Examples:
[FEATURE] Add wait time prediction algorithm
[FIX] Resolve queue sorting bug
[DOCS] Update API endpoint documentation
```

### PR Description
```markdown
## Description
Brief explanation of what this PR does

## Related Issue
Fixes #123

## Changes Made
- Change 1
- Change 2
- Change 3

## Testing
- [ ] Added/updated tests
- [ ] All tests pass
- [ ] Manual testing done

## Screenshots (if UI changes)
[Attach screenshots]

## Checklist
- [ ] Code follows style guidelines
- [ ] Documentation updated
- [ ] No breaking changes
- [ ] All CI checks pass
```

### During Review
- **Be responsive** to feedback
- **Discuss respectfully** if you disagree
- **Make requested changes** promptly
- **Test reviewer suggestions**
- **Thank reviewers** for their time

---

## Issue Management

### Creating an Issue

**Title Format:**
```
[TYPE] Brief description

Examples:
[BUG] Queue numbers not updating in real-time
[FEATURE] Add SMS notifications for wait times
[DISCUSSION] Better error handling strategy
```

**Issue Template:**
```markdown
## Description
Clear description of the issue

## Steps to Reproduce (if bug)
1. Step 1
2. Step 2
3. Step 3

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- OS: 
- Browser/Python version:
- Branch:

## Additional Context
Any other relevant information
```

### Using Labels

Use these labels to categorize your work by team/area:
- `fs` - Full Stack development (frontend + backend)
- `ds` - Data Science / ML model development
- `ai` - AI/ML related tasks

### Issue Status
- **Open**: Active work or waiting for assignment
- **In Progress**: Someone is working on it
- **In Review**: PR submitted, under review
- **Closed**: Resolved or won't be fixed

---

## Communication & Support

### Getting Help
1. **Check documentation** in README and docs folder
2. **Search existing issues** and discussions
3. **Ask in issue comments** or create a discussion
4. **Reach out to maintainers** via GitHub

### Response Time
- Issues: 2-3 days
- PR reviews: 3-5 days
- Discussions: Best effort

### Code of Conduct
- Be respectful and inclusive
- Provide constructive feedback
- No harassment or discrimination
- Help others learn and grow

---

## Advanced Topics

### Syncing Your Local Branch
```bash
# Update your local develop
git fetch origin
git checkout develop
git merge origin/develop

# Or if working on a feature branch and develop was updated
git fetch origin
git rebase origin/develop
```

### Creating a Pull Request to develop
```bash
# Make sure develop is up to date
git fetch origin
git merge origin/develop

# Push your feature branch
git push origin feature/description

# Create PR targeting 'develop' branch at:
# https://github.com/SQueue-Care/[repo-name]/compare/develop...feature/description
```

### Rebasing Before PR
```bash
# Interactive rebase to clean up commits
git rebase -i origin/develop

# Force push (use carefully!)
git push origin feature/description --force-with-lease
```

### Squashing Commits
```bash
# If maintainer asks to squash
git rebase -i HEAD~3  # For last 3 commits
# Mark commits as 'squash' or 's'
# Save and resolve conflicts if any
git push origin feature/description --force-with-lease
```

---

<!-- ## Project Structure Reference

SQueue-Care has multiple repositories organized by team:

```
SQueue-Care Organization (https://github.com/SQueue-Care)
├── fs-repo/                  # Full Stack (Frontend + Backend)
│   ├── frontend/             # React app (patient portal & admin dashboard)
│   │   ├── src/
│   │   │   ├── components/  # Reusable UI components
│   │   │   ├── pages/       # Page components
│   │   │   ├── services/    # API calls
│   │   │   └── hooks/       # Custom React hooks
│   │   └── package.json
│   └── backend/              # FastAPI/Django application
│       ├── app/
│       │   ├── models/      # Database models
│       │   ├── routes/      # API endpoints
│       │   ├── services/    # Business logic
│       │   └── middleware/  # Auth, error handling
│       ├── tests/           # Test files
│       └── requirements.txt
├── ds-repo/                  # Data Science
│   ├── data/                # Raw and processed datasets
│   ├── notebooks/           # Jupyter notebooks for analysis
│   ├── analysis/            # Data analysis scripts
│   └── requirements.txt
└── ai-repo/                  # AI/ML Model
    ├── models/              # Trained models
    ├── training/            # Training scripts
    ├── api/                 # FastAPI application for model serving
    └── requirements.txt
``` -->

**Key Points:**
- Each repository has `main` and `develop` branches
- Always work from the `develop` branch
- Use labels `fs`, `ds`, or `ai` to categorize issues
- PRs should target the `develop` branch

---

## Useful Resources

- **SQueue-Care Organization**: [https://github.com/SQueue-Care](https://github.com/SQueue-Care)
- **Project PRD**: [PRD.md](./PRD/PRD.md)
- **Database Schema**: [Database Schema](./Database%20Schema/)
- **Architecture Flowchart**: [Flowchart](./Flowchart/)
- **Development Schedule**: [Schedule](./Schedule/)

---

## Tips for Success

**Do:**
- Read the PRD and understand the project goals
- Check existing issues before starting
- Write clear, focused commits
- Test your changes thoroughly
- Document as you code
- Ask for help when stuck
- Review other PRs and learn from them

**Don't:**
- Work without an assigned issue
- Create large PRs with many unrelated changes
- Commit to main directly
- Skip testing
- Push API keys or secrets
- Ignore code review feedback
- Rush through documentation

---

## Thank You! 🙏

Your contributions make this project better. We appreciate your time and effort in making the Smart Healthcare Queue System a reality. If you have questions or suggestions about this contributing guide, please open an issue or reach out to maintainers.

**Happy coding!**
