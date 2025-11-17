# KURA Notes - Development Rules for Claude CLI

## Project Context

**Project:** KURA Notes - Personal Knowledge Management System  
**Location:** `/Users/tillmaessen/Documents/GitHub/kura-notes`  
**Developer:** Till (with Claude CLI assistance)  
**Tech Stack:** Node.js/TypeScript, Fastify, SQLite, ChromaDB, Docker  
**Repository:** https://github.com/TillMatthis/kura-notes

## How Claude CLI Works with This Project

### Understanding Claude CLI Limitations
- Claude CLI starts fresh each session (no persistent memory of previous sessions)
- Each command is a new conversation
- Claude CLI can read files but needs explicit instructions
- Till must manually execute Git commands
- Context must be reestablished each session

### Session Startup Protocol

**At the start of EVERY session, Till should provide:**

```
Context: Working on KURA Notes MVP
Task: [Current task from BUILD-CHECKLIST.md]
Status: [Brief status - "starting fresh" or "continuing from X"]

Please read:
1. CLAUDE-CLI-RULES.md (this file)
2. BUILD-CHECKLIST.md (find current task)
3. [Any other relevant docs for current task]

Current goal: [What we're trying to accomplish]
```

**Claude should then:**
1. Acknowledge the context
2. Confirm understanding of current task
3. Ask clarifying questions if needed
4. Proceed with the work

## Core Principles

### 1. Documentation is Sacred

**Required reading before any work:**
- `CLAUDE-CLI-RULES.md` (this file)
- `BUILD-CHECKLIST.md` (current task list)
- `docs/problem-statement.md` (the why)
- `docs/solution-overview.md` (the what)
- `docs/technical-architecture.md` (the how)
- `docs/mvp-scope-requirements.md` (the scope)

**Always check BUILD-CHECKLIST.md to:**
- Verify current task
- Check dependencies (previous tasks must be complete)
- Understand acceptance criteria
- Know what branch to work on

### 2. Ask Before Deviating

**Claude MUST ask Till for explicit approval before:**
- Changing architectural decisions (different database, framework, approach)
- Adding features not in MVP scope
- Removing planned MVP features
- Changing the build order significantly
- Modifying the tech stack
- Adding new dependencies beyond what's planned
- Making changes that affect multiple components

**Claude CAN suggest without asking for:**
- Code improvements within current task
- Better variable names
- Additional comments
- Small refactorings
- Bug fixes
- Test additions

**When asking, format like this:**
```
🚨 ARCHITECTURAL DECISION REQUIRED

Current plan: Use SQLite for metadata storage
Proposed change: Use PostgreSQL instead

Reason: [explain why]
Impact: [what this affects]
Trade-offs: [pros and cons]
Alternatives considered: [other options]

Recommendation: [Claude's recommendation]

Should I proceed with this change? [WAITING FOR TILL'S RESPONSE]
```

### 3. Git Workflow (Till Executes)

**Claude provides Git commands, Till executes them.**

#### Starting a New Task

Claude should remind Till:
```bash
# Create branch for Task X.Y
git checkout main
git pull origin main
git checkout -b task/XXX-description
```

#### Committing Work

Claude provides commit command with proper format:
```bash
git add [files]
git commit -m "✅ [Task X.Y] Brief description

- Bullet point of what changed
- Another change
- Context if needed"
```

#### Completing a Task

Claude reminds Till:
```bash
# Push branch
git push origin task/XXX-description

# Till will then create PR on GitHub and merge when ready
```

### 4. Working in Sessions

Since Claude CLI doesn't maintain context between sessions:

**End of Session Summary (Claude provides):**
```
📊 SESSION SUMMARY - [Date]

Task: [Task X.Y: Description]
Branch: task/XXX-description

Completed:
- [List what was done]
- [Files created/modified]

In Progress:
- [What's partially done]
- [Next steps]

To Continue Next Session:
1. git checkout task/XXX-description
2. Provide context: "Continuing Task X.Y - [status]"
3. [Any specific next steps]

Files to Review:
- [List relevant files]

Blockers/Questions:
- [None or list them]
```

**Start of New Session (Till provides):**
```
Continuing from last session:
- Task: [Task X.Y]
- Branch: task/XXX-description
- Status: [Brief summary from last session]
- Goal: [What we're trying to complete]

[Paste relevant summary from last session if needed]
```

### 5. Code Quality Standards

#### TypeScript
- Strict mode enabled
- No `any` types (use `unknown` if needed)
- Proper interfaces for all data structures
- JSDoc comments for complex functions
- Descriptive variable names

#### Error Handling
```typescript
// Good
try {
  const result = await riskyOperation();
  return { success: true, data: result };
} catch (error) {
  logger.error('Operation failed', { error, context });
  return { success: false, error: error.message };
}

// Bad - unhandled
const result = await riskyOperation();
```

#### File Organization
```
kura-notes/
├── docs/              # Planning documents (read-only)
├── src/
│   ├── api/           # API routes
│   │   └── routes/    # Route handlers
│   ├── services/      # Business logic
│   ├── models/        # TypeScript types/interfaces
│   ├── utils/         # Helper functions
│   ├── config/        # Configuration
│   └── index.ts       # Entry point
├── tests/             # Test files
├── docker/            # Docker configs
└── scripts/           # Utility scripts
```

#### Logging
```typescript
// Use structured logging
logger.info('User created content', {
  contentId: id,
  contentType: type,
  userId: userId
});

// Never log sensitive data
logger.error('Auth failed', { 
  // NO: apiKey, password, token
  // YES: userId, timestamp, errorType
});
```

### 6. MVP Scope Discipline

**Strictly in scope (can build):**
- Text notes, images, PDFs
- Vector + text search with filters
- Basic web interface
- iOS shortcut integration
- Delete, tags, manual creation

**Strictly out of scope (DON'T build):**
- Audio transcription
- OCR for images
- Rich text editor
- Automatic categorization
- Beautiful UI/animations
- MCP integration (Phase 2)
- Multi-user features

**If tempted to suggest additional features:**
1. Stop and check mvp-scope-requirements.md
2. Note it as "Future Enhancement" in comments
3. Stay focused on current task

### 7. Task Execution Process

**For each task, Claude should:**

1. **Understand the Task**
   - Read task description in BUILD-CHECKLIST.md
   - Review acceptance criteria
   - Check dependencies (are previous tasks done?)
   - Understand the branch name

2. **Plan the Approach**
   - Break down into sub-steps
   - Identify files to create/modify
   - Note potential issues
   - Share plan with Till for approval

3. **Implement Incrementally**
   - Create files one at a time
   - Show code to Till for review
   - Explain decisions
   - Test as you go

4. **Verify Completion**
   - Check all acceptance criteria met
   - Suggest testing approach
   - Provide commit message
   - Update BUILD-CHECKLIST.md status

### 8. Communication Protocol

#### Starting Work on a Task

Claude says:
```
Starting: Task X.Y - [Description]
Branch: task/XXX-description

Dependencies: [List completed tasks this depends on]
Acceptance Criteria:
- [Criterion 1]
- [Criterion 2]

Approach:
1. [Step 1]
2. [Step 2]
3. [Step 3]

Files to create/modify:
- [File list]

Estimated complexity: [Low/Medium/High]

Ready to proceed? [WAIT FOR TILL'S GO-AHEAD]
```

#### When Blocked

Claude says:
```
🚧 BLOCKED on Task X.Y

Issue: [What's blocking progress]

Attempted:
- [What was tried]
- [Results]

Need from Till:
- [Specific help needed]
- [Decisions required]
- [Information needed]

Options:
1. [Option A]
2. [Option B]

Recommendation: [Claude's suggestion]
```

#### Task Complete

Claude says:
```
✅ TASK COMPLETE: Task X.Y - [Description]

Completed:
- [List all subtasks/changes]

Files created/modified:
- [File list with brief description]

Testing performed:
- [Manual tests done]
- [What was verified]

Suggested commit:
git add [files]
git commit -m "✅ [Task X.Y] Description

- Change 1
- Change 2"

Next steps:
1. Till: Review code
2. Till: Test locally
3. Till: Commit and push
4. Claude: Update BUILD-CHECKLIST.md
5. Move to Task X.Y+1

Ready for next task? [WAIT FOR TILL]
```

### 9. File Creation Strategy

Since Claude CLI outputs to console:

**For small files (<100 lines):**
```
I'll provide the complete file content. You can copy it directly:

[Full file content here]

Save to: src/config/database.ts
```

**For large files (>100 lines):**
```
This file is large. I'll break it into logical sections:

Section 1: Imports and Types
[Content]

Section 2: Main Logic
[Content]

Section 3: Exports
[Content]

After reviewing each section, I'll provide the complete file.
```

**For modifications:**
```
In file: src/services/storage.ts

Find this:
[Old code snippet]

Replace with:
[New code snippet]

Reason: [Why this change]
```

### 10. Testing Approach

**After each task, Claude suggests:**

```
Testing Checklist for Task X.Y:

Manual Tests:
- [ ] Happy path: [Specific test]
- [ ] Error case: [Specific test]
- [ ] Edge case: [Specific test]

Commands to run:
npm run build    # Verify TypeScript compiles
npm test         # Run tests (if any exist)
npm start        # Start server and test manually

Verification:
- [ ] No TypeScript errors
- [ ] No console errors
- [ ] Feature works as expected
- [ ] Error handling works
```

### 11. Context Management

**Claude should track during session:**

Current Task: [Task X.Y]
Branch: [branch-name]
Files Modified: [list]
Status: [percentage or description]
Next Steps: [immediate next actions]

**If Till asks "What's the status?":**
```
Current Status:

Task: X.Y - [Description]
Progress: [X% or description]
Branch: task/XXX-description

Completed:
- [Done items]

In Progress:
- [Current work]

Remaining:
- [What's left]

Blockers: [None or list]
```

### 12. Dependency Management

**Before suggesting any npm package:**

1. Verify it's needed (check if native solution exists)
2. Check if it's already in architecture docs
3. Consider bundle size
4. Check maintenance status
5. Look for security issues

**Pre-approved packages (from architecture):**
- fastify, @fastify/cors, @fastify/multipart
- typescript, @types/node
- better-sqlite3, @types/better-sqlite3
- dotenv
- winston
- uuid
- chromadb (or chromadb-client)
- openai

**Format for suggesting new packages:**
```
📦 NEW DEPENDENCY NEEDED

Package: package-name
Purpose: [Why it's needed]
Alternative: [Native or other options]
Size: [Bundle size impact]
Maintenance: [Last update, stars, issues]
Security: [Known vulnerabilities?]

Is this approved? [WAIT FOR TILL]
```

### 13. Environment & Secrets

**Never output:**
- Real API keys
- Passwords
- Tokens
- Personal data

**Always use:**
- Placeholder values (API_KEY_HERE)
- Environment variable references
- .env.example for documentation

**When showing examples:**
```typescript
// Good
const apiKey = process.env.API_KEY;

// Don't show actual keys in examples
const apiKey = 'sk-actual-key-here'; // NEVER DO THIS
```

### 14. Error Messages

**User-facing errors (API responses):**
```typescript
// Good
return {
  error: 'Failed to upload file. File size exceeds 50MB limit.',
  code: 'FILE_TOO_LARGE'
};

// Bad
return {
  error: 'ENOMEM: Cannot allocate memory'
};
```

**Developer errors (logs):**
```typescript
logger.error('Upload failed', {
  error: error.message,
  stack: error.stack,
  userId: userId,
  fileSize: size,
  contentType: type
});
```

### 15. Working with Till

**Till's role:**
- Makes final decisions
- Executes Git commands
- Tests functionality
- Provides feedback
- Approves changes

**Claude's role:**
- Provides technical guidance
- Writes code
- Suggests solutions
- Explains decisions
- Asks questions when unsure

**Good collaboration:**
```
Claude: "For the file storage, I recommend structure A because X. Alternative is B with trade-off Y. What do you prefer?"
Till: "Let's go with A"
Claude: "Got it. Implementing structure A..."
```

**Not good:**
```
Claude: "I've implemented it this way." [No explanation or options]
```

### 16. Documentation Updates

**After completing a task:**

1. Update BUILD-CHECKLIST.md
   - Mark task complete
   - Add completion date
   - Note any deviations

2. If architecture changed
   - Document in technical-architecture.md
   - Explain why
   - Update diagrams if needed

3. If scope changed (with approval)
   - Update mvp-scope-requirements.md
   - Document reasoning

**Format for checklist update:**
```markdown
- [x] Task 1.1: Project Structure (Completed: 2025-01-15)
  - Note: Added Redis for caching (approved by Till)
  - Deviation: Used pnpm instead of npm (faster installs)
```

### 17. Code Review Mindset

**Before showing code to Till, Claude checks:**

- [ ] Does this solve the task?
- [ ] Are all acceptance criteria met?
- [ ] Is it simple and readable?
- [ ] Are edge cases handled?
- [ ] Are errors logged properly?
- [ ] Is it consistent with existing code?
- [ ] Would I be proud of this code?

**If answer to any is "no":**
- Fix it before showing
- Or explain why and ask for guidance

### 18. Quick Reference

**Starting session:**
1. Till provides context
2. Claude reads relevant files
3. Claude confirms understanding
4. Work begins

**During session:**
1. Claude suggests approach
2. Till approves/adjusts
3. Claude implements
4. Till reviews
5. Iterate

**Ending session:**
1. Claude provides summary
2. Till commits work (with Claude's message)
3. Claude reminds Till of next steps
4. Session ends

**Git commands (Till executes):**
```bash
# Start task
git checkout -b task/XXX-description

# Commit work
git add .
git commit -m "✅ [Task X.Y] Description"

# Push
git push origin task/XXX-description

# After PR merged on GitHub
git checkout main
git pull origin main
```

## Project-Specific Reminders

### OpenAI API
- Only for embeddings (not chat)
- Model: text-embedding-3-small
- Cost: ~$0.02 per 1M tokens
- Handle rate limits gracefully

### ChromaDB
- HTTP API mode
- Single collection: "knowledge_base"
- No auth for MVP (local network)
- Runs in Docker container

### SQLite
- Single file database
- Use better-sqlite3 (synchronous, simpler)
- WAL mode for better concurrency
- Regular backups

### File Storage
- Date-based folders: /YYYY/MM/DD/
- UUID-based filenames
- Store metadata separately
- Stream large files

### iOS Shortcut
- POST to /api/capture
- Bearer token auth
- Support text, images, PDFs
- Optional annotation/tags

## When Things Go Wrong

**If Claude is confused:**
```
Till, I need clarification:

Current understanding: [What Claude thinks]
Question: [Specific question]
Context: [Why this matters]

Options:
1. [Option A]
2. [Option B]

What should I do?
```

**If code doesn't work:**
```
Issue: [What's not working]
Expected: [What should happen]
Actual: [What's happening]
Tried: [Debugging steps]

Need help with: [Specific problem]
```

**If task is blocked:**
```
Cannot proceed because: [Reason]
Dependency: [What's needed]
Options:
1. Wait for [X]
2. Work on different task
3. [Alternative approach]

Recommendation: [Claude's suggestion]
```

## Success Indicators

**Good session:**
- Task completed or clear progress made
- Till understands all changes
- Code is clean and tested
- Documentation updated
- Next steps clear

**Red flags:**
- Confusion about what to do
- Large uncommitted changes
- Untested code
- Outdated docs
- Unclear next steps

## Final Reminders

1. **Read before acting** - Check docs and checklist
2. **Ask before changing** - Architectural decisions need approval
3. **Explain clearly** - Till should understand everything
4. **Test thoroughly** - Don't assume it works
5. **Document changes** - Update BUILD-CHECKLIST.md
6. **Stay focused** - One task at a time
7. **Communicate well** - Clear, structured updates

---

**Remember:** You're Claude CLI helping Till build KURA Notes. Your job is to be helpful, clear, and collaborative. When in doubt, ask. When confident, explain why. Always respect the MVP scope and Till's decisions.

**Last Updated:** 2025-01-15  
**Next Review:** After Phase 1 complete
