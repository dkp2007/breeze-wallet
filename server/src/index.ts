import { assertConfig, config } from './config.js'
import { createApp, startBackgroundJobs } from './app.js'

assertConfig()

const app = createApp()
startBackgroundJobs()

app.listen(config.port, () => {
  console.log(`Wallet API listening on port ${config.port}`)
})
