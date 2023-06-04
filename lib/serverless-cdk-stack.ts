import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";

export class ServerlessCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a simple hello world lambda function
    const handler = new lambda.Function(this, "HelloWorldTestFunction", {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset("src/handlers"),
      handler: "hello-world.handler",
      environment: {
        LOG_LEVEL: "DEBUG"
      }
    });

    // Creates a Lambda function which will be used as Lambda Authorizer for API GW
    const authorizerFunction = new lambda.Function(this, "HeaderLambdaAuthorizerFunction", {
      runtime: lambda.Runtime.NODEJS_16_X,
      code: lambda.Code.fromAsset("src/handlers"),
      handler: "header-lambda-authorizer.handler"
    });

    // Create the main API GW
    const api = new apigateway.RestApi(this, "ApiGateway", {
      restApiName: "test-api-gw",
      description: "This API service serves hellos."
    });

    // Attach the Lambda Authorizer function to the API GW as a Token Authorizer,
    // setting the expected Token to be extracted from x-authorization-header header
    // and the header value to be validation against a regex (== not empty)
    const authorizer = new apigateway.TokenAuthorizer(this, "HeaderLambdaAuthorizer", {
      handler:authorizerFunction,
      identitySource: "method.request.header.x-authorization-header",
      validationRegex: "(.|\\s)*\\S(.|\\s)*",
      resultsCacheTtl: cdk.Duration.seconds(0)
    });

    // Mapping template will be used to map all headers, and context, from the request
    // to the Lambda function
    const mappingTemplate = `
      {
        "method": "$context.httpMethod",
        "body" : $input.json('$'),
        "headers": {
          #foreach($param in $input.params().header.keySet())
          "$param": "$util.escapeJavaScript($input.params().header.get($param))"
          ,
          #end
          "randomContext": "$context.authorizer.randomContext",
          "userId": "$context.authorizer.userId",
          "set-cookie": "$context.authorizer.set-cookie"
        }
      }
    `;
    
    // Creates a new Lambda integration for the Hello World function 
    // to be used with the API GW, with all the necessary mappings
    const helloWorldIntegration = new apigateway.LambdaIntegration(handler, {
      proxy: false,
      allowTestInvoke: true,
      passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_TEMPLATES,

      requestTemplates: {
        "application/json": mappingTemplate
      },

      integrationResponses: [
        {
          // Successful response from the Lambda function, no filter defined
          //  - the selectionPattern filter only tests the error message
          // We will set the response status code to 200
          statusCode: "200",
          responseTemplates: {
            // This template takes the "message" result from the Lambda function, and embeds it in a JSON response
            // Check https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html
            'application/json': JSON.stringify({ state: 'ok', greeting: '$util.escapeJavaScript($input.body)' })
          },          
          responseParameters: {
            // We can map response parameters
            // - Destination parameters (the key) are the response parameters (used in mappings)
            // - Source parameters (the value) are the integration response parameters or expressions
            'method.response.header.Content-Type': "'application/json'",
            'method.response.header.Access-Control-Allow-Origin': "'*'",
            'method.response.header.Access-Control-Allow-Credentials': "'true'",
            'method.response.header.Set-Cookie' : "context.authorizer.set-cookie"
          }
        },
        {
          // For errors, we check if the error message is not empty, get the error data
          selectionPattern: '(\n|.)+',
          // We will set the response status code to 200
          statusCode: "400",
          responseTemplates: {
              'application/json': JSON.stringify({ state: 'error', message: "$util.escapeJavaScript($input.path('$.errorMessage'))" })
          },
          responseParameters: {
              'method.response.header.Content-Type': "'application/json'",
              'method.response.header.Access-Control-Allow-Origin': "'*'",
              'method.response.header.Access-Control-Allow-Credentials': "'true'",
              'method.response.header.Set-Cookie' : "context.authorizer.set-cookie"
            }
        }
      ]
    });

    // Adds a root path mapping, with POST method to the API GW, and routes the requests
    // to the Lambda function integration we previously created 
    api.root.addMethod("POST", helloWorldIntegration , {
      methodResponses: [
        {
          // Successful response from the integration
          statusCode: '200',
          // Define what parameters are allowed or not
          responseParameters: {
            'method.response.header.Content-Type': true,
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Credentials': true,
            'method.response.header.Set-Cookie': true
          },
        },
        {
          // Same thing for the error responses
          statusCode: '400',
          responseParameters: {
            'method.response.header.Content-Type': true,
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Credentials': true,
            'method.response.header.Set-Cookie': true
          },
        }
      ],
      authorizer: authorizer
    }); // POST /
  }
}

