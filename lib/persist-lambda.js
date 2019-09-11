const AWS = require('aws-sdk')

const initialize = () => {
  AWS.config.update({ region: process.env.REGION })
  return {
    docClient: new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10' }),
    TableName: process.env.TABLE_NAME,
    primaryKeyColumn: process.env.PRIMARY_KEY_COLUMN_NAME,
    sortKeyColumn: process.env.SORT_KEY_COLUMN_NAME,
    region: process.env.REGION
  }
}

const isConfigInvalid = ({ docClient, TableName, primaryKeyColumn, sortKeyColumn, region }) => {
  if (!docClient || !TableName || !primaryKeyColumn || !sortKeyColumn || !region) {
    return true
  }
}

const getPayload = (record, index) => {
  try {
    return JSON.parse(record.Sns.Message).payload
  } catch (e) {
    console.error(`Record ${index} was improperly formatted`)
    return `Record ${index} was improperly formatted`
  }
}

const logResultMessage = (config, Item, failure) => {
  const pKeyPair = `${config.primaryKeyColumn}=${Item[config.primaryKeyColumn]}`
  const sKeyPair = `${config.sortKeyColumn}=${Item[config.sortKeyColumn]}`
  let message = `Record updated for ${pKeyPair} and ${sKeyPair}`
  if (failure) {
    message = `Failure updating ${pKeyPair} and ${sKeyPair}`
    console.error(message)
  } else {
    console.log(message)
  }
  return message
}

const doPut = (config, Item) => {
  const params = {
    TableName: config.TableName,
    Item
  }
  return config.docClient.put(params).promise()
    .then(() => logResultMessage(config, Item))
    .catch(() => Promise.reject(logResultMessage(config, Item, true)))
}

const persistLambda = async (event) => {
  const config = initialize()

  if (isConfigInvalid(config)) {
    return Promise.reject(new Error('lambda is not properly configured'))
  }

  return Promise.all(event.Records
    .map(getPayload)
    .map(payload => {
      if (typeof payload === 'string') {
        return Promise.reject(payload)
      }
      return doPut(config, payload)
    })
  )
    .then(() => 'ok')
}

module.exports = persistLambda
