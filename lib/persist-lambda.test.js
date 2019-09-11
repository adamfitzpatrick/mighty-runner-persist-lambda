const rewire = require('rewire')
const sinon = require('sinon')
const chai = require('chai')
chai.should()
chai.use(require('chai-as-promised'))
chai.use(require('sinon-chai'))

describe('persist-lambda', () => {
  let sut
  let docClientMock
  let consoleStubs
  let event

  const promiseResolver = (value) => {
    return { promise: () => Promise.resolve(value) }
  }

  const setEnvVars = () => {
    sut.__set__('process', {
      env: {
        TABLE_NAME: 'table',
        PRIMARY_KEY_COLUMN_NAME: 'key',
        SORT_KEY_COLUMN_NAME: 'sort',
        REGION: 'us-west-2'
      }
    })
  }

  beforeEach(() => {
    sut = rewire('./persist-lambda')
    const fakeDocClient = {
      put: () => 'put'
    }
    docClientMock = sinon.mock(fakeDocClient)
    const FakeDocClientConstructor = function () {
      Object.assign(this, fakeDocClient)
    }
    sut.__get__('AWS').DynamoDB = {
      DocumentClient: FakeDocClientConstructor
    }
    consoleStubs = {
      log: sinon.stub(),
      error: sinon.stub()
    }
    sut.__set__('console', consoleStubs)
    event = {
      Records: [{
        Sns: {
          Message: JSON.stringify({ payload: { key: 'KEY1', sort: 'sort1', data: 'data1' } })
        }
      }, {
        Sns: {
          Message: JSON.stringify({ payload: { key: 'KEY2', sort: 'sort2', data: 'data2' } })
        }
      }]
    }
  })

  describe('when provided properly formatted messages', () => {
    it('should put the item in the table using the auth token as primary key and pathParameter as sort key', () => {
      setEnvVars()
      const params = {
        TableName: 'table',
        Item: {
          key: sinon.match.string,
          sort: sinon.match.string,
          data: sinon.match.string
        }
      }
      docClientMock.expects('put')
        .withExactArgs(params)
        .twice()
        .returns(promiseResolver({}))
      return sut(event).should.eventually.deep.equal('ok').then(() => {
        consoleStubs.log.should.have.been.calledWith('Record updated for key=KEY1 and sort=sort1')
        consoleStubs.log.should.have.been.calledWith('Record updated for key=KEY2 and sort=sort2')
        docClientMock.verify()
      })
    })
  })

  describe('when one or more messages is not properly formatted', () => {
    it('should put the item in the table using the auth token as primary key and pathParameter as sort key', () => {
      setEnvVars()
      event.Records[1].Sns.Message = 'bad json'
      const params = {
        TableName: 'table',
        Item: {
          key: sinon.match.string,
          sort: sinon.match.string,
          data: sinon.match.string
        }
      }
      docClientMock.expects('put')
        .withExactArgs(params)
        .returns(promiseResolver({}))
      return sut(event).should.be.rejectedWith('Record 1 was improperly formatted').then(() => {
        consoleStubs.error.should.have.been.calledWith('Record 1 was improperly formatted')
        consoleStubs.log.should.have.been.calledWith('Record updated for key=KEY1 and sort=sort1')
        docClientMock.verify()
      })
    })
  })

  describe('when the lambda is not properly configured', () => {
    it('should log the error and provide a 500 response', () => {
      sut.__set__('process', { env: {} })
      return sut(event).should.be.rejectedWith('lambda is not properly configured')
    })
  })

  describe('when dynamo returns an error', () => {
    it('should log the error', () => {
      setEnvVars()
      const params1 = {
        TableName: 'table',
        Item: {
          key: 'KEY1',
          sort: 'sort1',
          data: 'data1'
        }
      }
      const params2 = {
        TableName: 'table',
        Item: {
          key: 'KEY2',
          sort: 'sort2',
          data: 'data2'
        }
      }
      docClientMock.expects('put')
        .withExactArgs(params1)
        .returns(promiseResolver())
      docClientMock.expects('put')
        .withExactArgs(params2)
        .returns({ promise: () => Promise.reject(new Error('error')) })

      return sut(event).should.be.rejectedWith('Failure updating key=KEY2 and sort=sort2').then(() => {
        consoleStubs.log.should.have.been.calledWith('Record updated for key=KEY1 and sort=sort1')
        consoleStubs.error.should.have.been.calledWith('Failure updating key=KEY2 and sort=sort2')
      })
    })
  })
})
