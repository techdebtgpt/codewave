# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.0.1   | ✅ Current Release |
| < 0.0.1 | ❌ Not Supported   |

## Reporting Security Vulnerabilities

**Please do not open a public GitHub issue for security vulnerabilities.**

If you discover a security vulnerability, please email us at **security@techdebtgpt.com** with:

1. **Description**: Clear explanation of the vulnerability
2. **Steps to reproduce**: Exact steps to trigger the issue
3. **Impact**: Potential security impact
4. **Suggested fix** (optional): If you have a fix

We will:

- Acknowledge receipt within 48 hours
- Provide a timeline for addressing the issue
- Credit you in the security advisory (if desired)
- Work with you on responsible disclosure

## Security Considerations

### API Keys and Configuration

CodeWave handles sensitive information (API keys, LLM credentials). Please ensure:

1. **Never commit API keys** to version control
   - Use `.env` files (ignored in `.gitignore`)
   - Use environment variables for CI/CD
   - Use `.codewave.config.json` locally (in `.gitignore`)

2. **Secure storage** of credentials
   - Store in secure configuration managers
   - Use OS credential storage (macOS Keychain, Windows Credential Manager, etc.)
   - Rotate keys regularly

3. **Clear configuration before sharing**
   - Remove `.codewave.config.json` before sharing machines
   - Use `npm run build` only in trusted environments

### Dependency Security

We regularly:

- Update dependencies for security patches
- Review dependencies for known vulnerabilities
- Use npm audit to identify issues

To check for vulnerabilities locally:

```bash
npm audit
npm audit fix  # Auto-fix when possible
```

### LLM API Security

CodeWave communicates with third-party LLM providers:

1. **API Key Protection**
   - Keys are only sent to official LLM endpoints
   - Never logged or exposed

2. **Code Sharing**
   - Your code is sent to LLM providers for analysis
   - Review provider privacy policies
   - For sensitive code, use self-hosted or local models

3. **Evaluation Results**
   - Results stored locally by default
   - Configure output directory appropriately
   - Don't commit results containing sensitive info

### Data Handling

CodeWave processes:

- Git commit diffs
- Code content
- File names and structure

**Best practices:**

- Evaluate in private environments for sensitive projects
- Review evaluation reports before sharing
- Don't store reports in public repositories

## Build and Release Security

### Pre-Release Checks

Before publishing to npm:

```bash
npm run build          # Verify compilation
npm run lint           # Check code quality
npm audit              # Check dependencies
npm pack --dry-run     # Verify package contents
```

### NPM Publishing

- We use npm 2FA authentication
- Each release is tagged with version
- Changelog documents all changes
- Security fixes are prioritized

## Dependency Transparency

### Current Dependencies

Core runtime dependencies:

- **LangChain** - Multi-agent orchestration
- **LangGraph** - Workflow graph engine
- **Commander** - CLI framework
- **Inquirer** - Interactive prompts
- **LLM Provider SDKs**:
  - @anthropic-ai/sdk
  - @langchain/openai
  - @langchain/google-genai

All dependencies are evaluated for:

- Maintenance status
- Security track record
- License compatibility

### Audit Results

Regular `npm audit` results:

- Check repository for current status
- Report security issues to npm

## Security Best Practices for Users

### When Using CodeWave

1. **Authenticate safely**

   ```bash
   codewave config          # Interactive setup
   # Enter API key when prompted (not visible in terminal)
   ```

2. **Protect your configuration**

   ```bash
   # Check config is in .gitignore
   grep ".codewave.config.json" .gitignore
   ```

3. **Review evaluations before sharing**
   - Code content is visible in reports
   - Diffs may contain sensitive information

4. **Use appropriate models**
   - Local/self-hosted for highly sensitive code
   - Public models for less sensitive projects

5. **Monitor rate limits**
   - LLM providers track API usage
   - Be aware of rate limits and quotas

### For CI/CD Environments

1. **Use GitHub Secrets**

   ```yaml
   env:
     NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
     CODEWAVE_API_KEY: ${{ secrets.CODEWAVE_API_KEY }}
   ```

2. **Minimal permissions**
   - Use read-only API keys where possible
   - Rotate keys regularly

3. **Audit logs**
   - Monitor API usage
   - Track who can access evaluation results

## Incident Response

If we become aware of a security issue:

1. **Investigation** - We assess severity and impact
2. **Patch** - We create and test a fix
3. **Release** - We publish security update
4. **Notification** - We announce via GitHub and npm

## Compliance

CodeWave follows:

- **Apache 2.0 License** - Permissive open-source
- **Semantic Versioning** - Clear version expectations
- **npm Best Practices** - Package security standards

## Security Contact

- **Email**: security@techdebtgpt.com
- **GitHub**: Report via security advisory
- **Response time**: 48 hours

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [npm Security Guide](https://docs.npmjs.com/packages-and-modules/securing-your-code)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

---

**Last Updated**: November 9, 2025
**Version**: 1.0.0

Thank you for helping keep CodeWave secure! 🔒
