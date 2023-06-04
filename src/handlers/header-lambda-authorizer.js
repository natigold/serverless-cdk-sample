exports.handler =  async function(event, context, callback) {

    var token = event.authorizationToken;
    switch (token) {
        case 'allow':
            callback(null, generatePolicy('user', 'Allow', token, event.methodArn));
            break;
        case 'deny':
            callback(null, generatePolicy('user', 'Deny', token, event.methodArn));
            break;
        case 'unauthorized':
            callback("Unauthorized");   // Return a 401 Unauthorized response
            break;
        default:
            callback(null, generatePolicy('user', 'Deny', token, event.methodArn));
    }
};

// Help function to generate an IAM policy
var generatePolicy = function(principalId, effect, token, resource) {
    var authResponse = {};
    
    authResponse.principalId = principalId;
    if (effect && resource) {
        var policyDocument = {};
        policyDocument.Version = '2012-10-17'; 
        policyDocument.Statement = [];
        var statementOne = {};
        statementOne.Action = 'execute-api:Invoke'; 
        statementOne.Effect = effect;
        statementOne.Resource = resource;
        policyDocument.Statement[0] = statementOne;
        authResponse.policyDocument = policyDocument;
    }
    
    var cookieString = token + Math.floor(Math.random() * 65465421);
    
    // Optional output with custom properties of the String, Number or Boolean type.
    authResponse.context = {
        'set-cookie': cookieString,
        'userId': principalId,
        'randomContext': Math.floor(Math.random() * 65465421)
    };
    
    console.log('auth', authResponse);
    return authResponse;
}