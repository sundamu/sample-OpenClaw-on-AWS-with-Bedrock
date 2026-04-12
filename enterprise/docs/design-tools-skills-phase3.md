# Design: Tools & Skills Phase 3 — Employee Submission + Review

## Changes

### 1. Backend: New endpoints in agents.py

```
POST /api/v1/portal/skills/submit     — Employee uploads skill (skill.json + tool.js)
POST /api/v1/portal/skills/{name}/request — Employee requests access to approved skill
GET  /api/v1/tools-skills/pending      — Admin lists skills under review
POST /api/v1/tools-skills/{name}/review — Admin approves/rejects submitted skill
```

### 2. Backend: skill_loader.py reads EMP#.personalSkills

After loading POS#.defaultSkills, also load skills from EMP#.personalSkills list.

### 3. Backend: workspace_assembler.py reads personalSkills for pipeline API

Add personalSkills to pipeline response so frontend shows them.

### 4. Frontend: Portal "My Tools & Skills" page update

Add "Submit Skill" form + "Request Access" button on skill cards.

### 5. Frontend: Admin review UI

"Under Review" tab shows submitted skills with code preview + approve/reject.
