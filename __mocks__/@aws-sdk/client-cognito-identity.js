// Mock for @aws-sdk/client-cognito-identity
const mockSend = jest.fn();

class CognitoIdentityClient {
  constructor() {}
  send = mockSend;
}

class GetIdCommand {
  constructor(params) {
    this.input = params;
  }
}

class GetCredentialsForIdentityCommand {
  constructor(params) {
    this.input = params;
  }
}

module.exports = {
  CognitoIdentityClient,
  GetIdCommand,
  GetCredentialsForIdentityCommand,
  // Exported for test configuration
  __mockSend: mockSend,
};
