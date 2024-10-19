import express, { json } from 'express';
import { Octokit } from "@octokit/core";
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { versions } from './versions.js';
import fs from 'fs';
import path from 'path';

class Server {

  /** @type {Octokit} The Octokit instance for GitHub API interactions. */
  #octokit;

  /** @type {number} The port number on which the server will listen. */
  #port;

  /** @type {number} The delay in milliseconds before processing requests. */
  #delay;

  /** @type {string} The markdown template for the issue body. */
  #markdown;

  /** @type {Set<string>} The list of organizations to monitor. */
  #allowedOrganizations;

  /**
   * Creates an instance of the class.
   *
   * @param {Octokit} octokit - The Octokit instance for GitHub API
   * interactions.
   * @param {number} port - The port number on which the server will listen.
   * @param {number} delay - The delay in seconds before processing requests.
   * @param {string} markdown - The markdown template for the issue body.
   * @param {string[]} organizations - The list of organizations to monitor.
   */
  constructor(octokit, port, delay, markdown, organizations) {
    this.#octokit = octokit;
    this.#port = port;
    this.#delay = delay * 1000;
    this.#markdown = markdown;
    this.#allowedOrganizations = new Set(organizations);
  }

  /**
   * Starts the server.
   */
  start() {
    const port = this.#port;
    const app = express();
    app.use(json());
    app.post('/', this.handlePost.bind(this));
    app.listen(port, () => console.log(`Server started on port ${port}`));
  }

  /**
   * Handles the POST request for GitHub WebHook events.
   *
   * @param {Object} req - The request object.
   * @param {Object} req.body - The body of the request.
   * @param {Object} req.body.action - The action type of the event.
   * @param {Object} req.body.repository - The repository information.
   * @param {number} req.body.repository.id - The ID of the repository.
   * @param {string} req.body.repository.name - The name of the repository.
   * @param {boolean} req.body.repository.private - The visibility status of the
   * repository.
   * @param {Object} req.body.sender - The sender information.
   * @param {string} req.body.sender.login - The login name of the sender.
   * @param {Object} res - The response object.
   */
  async handlePost(req, res) {
    const payload = req.body;
    if (payload.action === 'created') {
      const repo = payload.repository;
      const id = repo.id;
      const creator = payload.sender.login;
      if (!repo.private) {
        console.log(
        // eslint-disable-next-line @stylistic/js/max-len
        `${creator} created a new public repository ${id} (${repo.name}), ignored`);
        return;
      }
      console.log(
        // eslint-disable-next-line @stylistic/js/max-len
        `${creator} created a new repository ${id} (${repo.name}). Check will be performed in 5 minutes.`);
      const o = {
        id: id,
        creator: creator
      };
      setTimeout(() => this.checkTeamAssociation(o), this.#delay);
    }
    res.status(200).send('OK');
  }

  /**
   * Checks if a repository is associated with any teams and creates an issue if
   * not.
   *
   * @async
   * @function checkTeamAssociation
   * @param {Object} o - The object containing repository details.
   * @param {number} o.id - The ID of the repository.
   * @param {string} o.creator - The creator of the repository.
   * @returns {Promise<void>} - A promise that resolves when the check is
   * complete.
   * @throws {Error} - Throws an error if the team association check fails.
   */
  async checkTeamAssociation(o) {
    const octokit = this.#octokit;
    const { id, creator } = o;
    try {
      const repoResponse = await octokit.request(
        'GET /repositories/{id}',
        {
          id: id
        });
      const repoData = repoResponse.data;
      const repoName = repoData.name;
      const repoOwner = repoData.owner.login;
      if (!this.#allowedOrganizations.has(repoOwner)) {
        console.log(
          // eslint-disable-next-line @stylistic/js/max-len
          `Repository ID ${id} (${repoOwner}/${repoName}): Not in allowed organizations`);
        return;
      }
      const teamsResponse = await octokit.request(
        'GET /repos/{owner}/{repo}/teams',
        {
          owner: repoOwner,
          repo: repoName
        });
      const teamData = teamsResponse.data;
      if (teamData.length > 0) {
        console.log(
          `Repository ID ${id} (${repoName}): Teams associated:`,
          teamData.map(team => team.name));
        return;
      }
      console.log(
        `Repository ID ${id} (${repoName}): No teams associated`);
      await this.createIssue(id, repoOwner, repoName, creator);
    } catch (error) {
      console.error(
        `Failed to check team association for repository ID ${id}:`,
        error.message);
    }
  }

  /**
   * Creates an issue in the specified GitHub repository.
   *
   * @param {number} repoId - The ID of the repository.
   * @param {string} owner - The owner of the repository.
   * @param {string} repo - The name of the repository.
   * @param {string} creator - The username of the issue creator.
   * @returns {Promise<void>} - A promise that resolves when the issue is
   * created.
   * @throws {Error} - Throws an error if the issue creation fails.
   */
  async createIssue(repoId, owner, repo, creator) {
    const octokit = this.#octokit;
    try {
      const markdown = this.#markdown;
      const response = await octokit.request(
        'POST /repos/{owner}/{repo}/issues',
        {
          owner: owner,
          repo: repo,
          title: 'Please check team association',
          body: `@${creator} ${markdown}`
        });
      console.log(
        // eslint-disable-next-line @stylistic/js/max-len
        `Created an issue for repository ID ${repoId} (${repo}): ${response.data.html_url}`);
    } catch (error) {
      console.error(
        `Failed to create an issue for repository ID ${repoId} (${repo}):`,
        error.message);
    }
  }
}

function readMarkdownFile(file) {
  const markdownPath = path.resolve(file);
  return fs.readFileSync(markdownPath, 'utf8');
}

const DEFAULT_PORT = 3000;
const DEFAULT_DELAY = 300;
const DEFAULT_MARKDOWN
  = 'This repository is not associated with any team. Please check.';
const argv = yargs(hideBin(process.argv))
  .version(versions['check-new-repo'])
  .usage('Usage: $0 [Options] Organization [Organization...]')
  .example('$0 --port 8080 your_organization', 'Start the server on port 8080')
  .option('port', {
    alias: 'p',
    type: 'number',
    description: 'Port number',
    default: `${DEFAULT_PORT}`
  })
  .option('delay', {
    alias: 'd',
    type: 'number',
    description: 'Seconds to wait before checking team association',
    default: `${DEFAULT_DELAY}`
  })
  .option('markdown-file', {
    alias: 'm',
    type: 'string',
    description: 'Path to the markdown file for the issue body',
  })
  .positional('Organizations', {
    describe: 'Allowed organizations',
    type: 'array',
  })
  .check((argv) => {
    const port = argv.port;
    if (port < 1 || port > 65535) {
      throw new Error('Port number must be in the range 1-65535');
    }
    if (argv._.length < 1) {
      throw new Error('At least one organization must be specified');
    }
    return true;
  })
  .fail((message, error) => {
    console.error('Error:', message || error.message);
    process.exit(1)
  })
  .help('help')
  .alias('help', 'h')
  // eslint-disable-next-line @stylistic/js/max-len
  .epilogue('For more details, see https://maroontress.github.io/check-new-repo/README.md')
  .argv;

const env = process.env;
const GITHUB_TOKEN = env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
  console.error('the environment variable GITHUB_TOKEN is not specified');
  process.exit(1);
}
const octokit = new Octokit({
  auth: GITHUB_TOKEN
});
const markdownFile = argv.markdownFile;
const markdown = markdownFile
  ? readMarkdownFile(markdownFile)
  : DEFAULT_MARKDOWN;
const app = new Server(octokit, argv.port, argv.delay, markdown, argv._);
app.start();
