import fs from 'fs'
import path from 'path'
import * as git from 'isomorphic-git'

const AUTHOR = { name: 'ChatPPT HTML Editor', email: 'html-editor@chatppt.local' }

/** 确保 dir 下有 git 仓库（内容版本由 git 管理）。 */
export async function ensureHtmlRepo(dir: string): Promise<void> {
  await fs.promises.mkdir(dir, { recursive: true })
  const gitDir = path.join(dir, '.git')
  if (!fs.existsSync(gitDir)) {
    await git.init({ fs, dir, defaultBranch: 'main' })
    await git.setConfig({ fs, dir, path: 'user.name', value: AUTHOR.name })
    await git.setConfig({ fs, dir, path: 'user.email', value: AUTHOR.email })
  }
}

export async function getHtmlRepoHead(dir: string): Promise<string> {
  return git.resolveRef({ fs, dir, ref: 'HEAD' })
}

export async function restoreHtmlRepoHead(dir: string, commitSha: string): Promise<void> {
  const currentBranchRef = await git.currentBranch({ fs, dir, fullname: true })
  await git.writeRef({
    fs,
    dir,
    ref: currentBranchRef || 'HEAD',
    value: commitSha,
    force: true
  })
}

export async function restoreHtmlFileAtCommit(
  dir: string,
  filepath: string,
  commitSha: string
): Promise<void> {
  await git.checkout({
    fs,
    dir,
    ref: commitSha,
    filepaths: [filepath],
    noUpdateHead: true,
    force: true
  })
}

/** 提交 dir 下 filepath（相对路径）的当前内容，返回 commit sha。 */
export async function commitHtmlFile(
  dir: string,
  filepath: string,
  message: string
): Promise<string> {
  await git.add({ fs, dir, filepath })
  return git.commit({ fs, dir, message, author: AUTHOR })
}

/** 读取某 commit 下 filepath 的内容（用于恢复版本）。 */
export async function readHtmlAtCommit(
  dir: string,
  filepath: string,
  oid: string
): Promise<string> {
  const { blob } = await git.readBlob({ fs, dir, oid, filepath })
  return Buffer.from(blob).toString('utf-8')
}
