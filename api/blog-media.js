import process from 'node:process'
import { createBlogMediaHandler } from '../server/blogMedia.js'

export default createBlogMediaHandler({ env: process.env })
