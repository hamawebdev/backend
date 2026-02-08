POST
	https://med-adn.com/api/v1/payments/checkouts
Status
500


request :
```json
{"studyPackId":7,"paymentDuration":{"type":"yearly","years":1},"locale":"en","paymentMethod":"edahabia"}
```

response :
```json
{"success":false,"error":{"type":"InternalServerError","message":"Chargily create checkout failed: {\"message\":\"Invalid success_url, it must begin with http or https. (and 2 more errors)\",\"errors\":{\"success_url\":[\"Invalid success_url, it must begin with http or https.\"],\"failure_url\":[\"The failure url field must be a valid URL.\"],\"webhook_endpoint\":[\"The webhook endpoint field must be a valid URL.\"]}}","timestamp":"2026-02-08T07:39:09.400Z","requestId":"p1tywnpnr1"}}
```


Refine the Chargily checkout logic to prevent 'Invalid URL' errors.

    Apply .trim() to APP_BASE_URL, WEBHOOK_PUBLIC_URL, and all success/failure paths to remove hidden spaces or newline characters from the environment variables.

    Ensure the success_url and failure_url are constructed as valid, absolute URLs without double slashes.

    Add a console.log right before the Chargily API call that outputs the final webhook_endpoint, success_url, and the exact character length of the webhook URL so I can debug hidden characters in the logs.