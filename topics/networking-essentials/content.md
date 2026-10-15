# Networking Essentials: Build a ride-hailing service

<!--
HOW TO EDIT
- Every step starts with a line "## Step N. Title". Do not change the step numbers.
- Step sections: "### Scenario", "### Question", "### Options", "### Comparison", "### Takeaway",
  then one or more story blocks such as "### How it’s done in practice: Uber".
- Separate paragraphs with a blank line. **bold**, `code` and [links](https://...) work.
- Options are lines "- **Name** — caption". Keep their number and order: the simulation is tied to them.
- In tables the first emoji sets the cell color: 🟢 good, 🟡 so-so, 🔴 bad, no emoji = neutral.
  A cell "auto" is computed by the simulation. Do not delete or reorder rows that contain "auto".
- In a story block, a line that is only a link becomes a link button under the text.
-->

---

## Step 1. Driver on the map

Article section: Transport layer

### Scenario

The driver app sends a GPS coordinate 4 times per second so the car moves smoothly on the rider’s map.

Drivers move around the city on mobile data, and in tunnels and underground parking the connection drops for a few seconds.

### Question

Which transport do we send coordinates over?

### Options

- **TCP** — Guaranteed delivery, strict ordering
- **UDP** — No delivery or ordering guarantees

### Takeaway

While the network is stable, TCP and UDP behave the same. The difference shows up when packets are lost in bursts.

TCP delivers everything, in order. After the tunnel it spends a few more seconds catching up on old coordinates: retransmission waits with doubling pauses (1 s, 2 s, 4 s), and fresh points queue up behind them. This is head-of-line blocking.

UDP shows the first fresh point right after the tunnel, and whatever was missed is simply gone. For coordinates that’s fine: nobody needs the car’s old position anymore.

Takeaway: pick the transport for the type of data. A stream where only the latest point matters can go without delivery guarantees. Data you can’t lose needs a reliable transport.

### How it’s done in practice: Uber

Uber measured that ~3.5% of packets on mobile networks are retransmitted, and the p99 TCP retransmission delay reached 28 s. They didn’t switch to “raw” UDP; instead they moved their apps to QUIC: a reliable transport on top of UDP without blocking on someone else’s loss. Tail latency dropped by 10–30%.

[Uber Engineering: Employing QUIC Protocol to Optimize Uber's App Performance](https://www.uber.com/blog/employing-quic-protocol/)

---

## Step 2. Driver accepted the request

Article section: Application layer

### Scenario

The rider requested a ride and is looking at the “Finding a driver” screen. As soon as a driver accepts, the screen must update by itself, then show “driver on the way” and “driver has arrived”.

Up to 100,000 riders are waiting for updates at the same time.

### Question

How does the rider’s phone learn about the new status?

### Options

- **Polling** — The phone asks every N seconds
- **SSE** — The server pushes over an open connection
- **WebSockets** — An open channel in both directions

### Comparison

| | auto | SSE | WebSockets |
|---|---|---|---|
| API requests per second | auto | 🟢 0 | 🟢 0 |
| Traffic | auto | 🟢 300 KB/s | 🟢 165 KB/s |
| Update delay | auto | 🟢 ~50 ms | 🟢 ~50 ms |
| Open connections on the server | 🟢 almost 0 | 🟡 100 000 | 🟡 100 000 |
| Direction | client asks | server → client | both directions |
| Pros | 🟢 simplest; works with any cache, proxy and load balancer | 🟢 plain HTTP; the browser reconnects by itself and resumes from the last event | 🟢 client can send data too; binary messages |
| Cons | 🔴 wasted requests and traffic; delay up to the interval | 🟡 one direction only; long connections must be kept open, and don't forget proxy timeouts | 🔴 separate protocol: upgrade on the load balancer, own heartbeat, reconnects and catching up on missed messages |

### Takeaway

**Polling** is the simplest and holds no connections, but pays for it in load and traffic: almost every request returns “no change”, and the rider sees the change up to one interval late. Asking more often means even more load.

**SSE** sends data only when something changes, so there are no API requests and hundreds of times less traffic. The cost: the server holds 100,000 open connections. But it’s plain HTTP, and the browser reconnects on its own.

**WebSockets** give the same result as SSE here but take more work: a separate protocol, load balancer support, your own heartbeat and reconnects. The second direction of the channel isn’t needed for status, so it’s extra complexity.

### How it’s done in practice: Uber and Shopify

**Uber.** At one point ~80% of requests to their API gateway were polling. They moved to push over SSE and grew to 1.5M concurrent connections.

[Uber Engineering: Uber's Real-Time Push Platform](https://www.uber.com/blog/real-time-push-platform/)

**Shopify.** Replaced polling (data showed up after 10 s at best) with SSE, and data started arriving in milliseconds.

[Shopify Engineering: Using Server Sent Events to Simplify Real-time Streaming at Scale](https://shopify.engineering/server-sent-events-data-streaming)

---

## Step 3. Driver app

Article section: Application layer

### Scenario

The driver app talks to the server constantly in both directions. The driver sends a position every 4 seconds. The server sends the driver new ride requests that must be accepted within 15 seconds, plus cancellations and route changes.

30,000 drivers are online. The server also needs to know which of them are connected right now, so it doesn’t offer a request to someone who closed the app.

### Question

How do we connect the driver app to the server?

### Options

- **Polling + POST** — Position via requests, poll for ride requests every 5 s
- **SSE + POST** — Ride requests over SSE, position as separate requests
- **WebSocket** — Everything in one two-way channel

### Comparison

| | Polling + POST | SSE + POST | WebSocket |
|---|---|---|---|
| HTTP requests per second | 🔴 14k | 🟡 7.5k | 🟢 0 |
| Request reaches the driver | 🔴 up to 5 s of the 15 to accept | 🟢 instantly | 🟢 instantly |
| Server notices the driver is gone | 🟡 when requests stop coming | 🟡 when POSTs stop coming | 🟢 after a few seconds without heartbeat |
| Open connections | 🟢 almost 0 | 🟡 30 000 | 🟡 30 000 |
| Pros | 🟢 simplest, plain HTTP | 🟢 requests arrive instantly; plain HTTP | 🟢 both streams in one connection; instant acks |
| Cons | 🔴 most requests; offers expire | 🟡 thousands of position requests; two separate channels | 🟡 separate protocol: load balancer, heartbeat, reconnects |

### Takeaway

This is the textbook case for WebSocket: the exchange is **frequent**, **constant** and **two-way**.

**Polling + POST** is the simplest but makes the most requests, and a ride request waits for the next poll, so some offers expire.

**SSE + POST** delivers ride requests right away, but every driver position is still a separate HTTP request with headers and auth: thousands of requests per second.

**WebSocket** carries both streams over one connection, and thanks to heartbeat the server sees within seconds that a driver is gone. The cost: a separate protocol, load balancer support and your own reconnects.

But if the client sends rarely (the ride status in the previous step), WebSocket adds nothing, and SSE is simpler.

### How it’s done in practice: LinkedIn, Slack and Uber

**LinkedIn** built its messenger on SSE because it passes through any network as plain HTTP.

[LinkedIn Engineering: Instant Messaging at LinkedIn](https://engineering.linkedin.com/blog/2016/10/instant-messaging-at-linkedin--scaling-to-hundreds-of-thousands-)

**Slack** sends the messages themselves through a regular API, and “typing…” over WebSocket.

[Slack Engineering: Real-time Messaging](https://slack.engineering/real-time-messaging/)

**Uber** hit the one-way limit of SSE: delivery acks had to be sent separately every 30 s, which was critical for driver offers. So they built the next generation of push on a bidirectional gRPC stream.

[Uber Engineering: Uber's Next Gen Push Platform on gRPC](https://www.uber.com/blog/ubers-next-gen-push-platform-on-grpc/)

---

## Step 4. Finding nearby drivers

Article section: Load balancing

### Scenario

For every ride request, dispatch-service asks location-service which drivers are nearby. The services talk over gRPC: HTTP/2, where many requests fly inside one long-lived TCP connection.

dispatch-service has 3 pods, location-service has 4. Each dispatch pod generates load that takes ~80% of one location pod.

### Question

How do we spread requests across location-service pods?

### Options

- **L4** — Plain Kubernetes Service
- **L7 proxy** — A proxy that parses HTTP/2, e.g. Envoy
- **Client-side** — dispatch knows all pods and picks itself

### Comparison

| | L4 | L7 proxy | Client-side |
|---|---|---|---|
| What it balances | connections | each request | each request |
| Load for gRPC | 🔴 uneven: one pod is on fire, others sit idle | 🟢 even | 🟢 even |
| New pods after scaling | 🔴 get no traffic until connections reopen | 🟢 in use right away | 🟡 after the pod list refreshes, within seconds |
| Extra hop | 🟢 no | 🟡 yes, plus one more component to keep alive | 🟢 no |
| Where the logic lives | 🟢 in the load balancer | 🟢 in the proxy | 🟡 in every client (built into gRPC) |
| When to use | long-lived connections where the connection is the session: WebSocket, phones | HTTP and gRPC, external traffic, when you don’t control the clients | internal services you control |

### Takeaway

**L4** balances connections, not requests. gRPC holds one long connection, so all traffic from a dispatch pod lands on one location pod. Some are overloaded, some sit idle, and new pods after scaling get nothing until connections are reopened.

**L7 proxy** balances each request separately and sees new pods right away. The cost: one more hop and one more component to keep alive.

**Client-side** balances each request without an extra hop, and the article directly recommends it for internal microservices: it’s built into gRPC. The cost: the client has to learn about new pods, and that happens with a delay.

And the other way around: for WebSocket connections from phones, L4 is a good fit, because one connection is one session.

### How it’s done in practice: Kubernetes and gRPC

A classic story from the Kubernetes blog: a gRPC app with several pods, but CPU is busy on only one. Same cause: kube-proxy balances connections, and HTTP/2 keeps one connection open for a long time.

[Kubernetes Blog: gRPC Load Balancing on Kubernetes without Tears](https://kubernetes.io/blog/2018/11/07/grpc-load-balancing-on-kubernetes-without-tears/)

---

## Step 5. New gateway pod

Article section: Load balancing algorithms

### Scenario

realtime-gateway holds riders’ open SSE connections: 100,000 connections on 4 pods, 25,000 each. Riders come and go all the time; every minute ~2% of connections close and reopen.

Morning peak: the autoscaler added a fifth pod. It’s empty. A pod holds at most 40,000 connections.

40% of riders use one mobile carrier that routes thousands of phones through a few shared IP addresses (carrier-grade NAT).

### Question

How does the load balancer pick a pod for a new connection?

### Options

- **Round robin** — Each pod in turn
- **Least connections** — To the pod with the fewest connections
- **IP hash** — The client’s IP address decides the pod

### Comparison

| | Round robin | Least connections | IP hash |
|---|---|---|---|
| What it considers | only the rotation, not the load | how many connections each pod holds right now | client IP address |
| New pod | 🔴 underloaded for hours | 🟢 evens out within minutes | 🟡 gets only its share of new clients |
| Clients behind CGNAT | 🟢 doesn’t notice | 🟢 doesn’t notice | 🔴 all on one pod |
| Sticky sessions | no | no | 🟢 yes, without a cookie |
| When to use | short, uniform requests (plain HTTP) | long-lived connections: SSE, WebSocket, databases | when a client must return to the same pod and clients aren’t behind NAT |

### Takeaway

**Round robin** counts only new connections and ignores how many a pod already holds. For short requests that doesn’t matter, but with long-lived connections the new pod stays underloaded for hours.

**Least connections** looks at current load and sends new connections to the least busy pod. For long sessions this is the best choice.

**IP hash** pins a client to a pod by IP address, which gives sticky sessions without cookies. But thousands of phones can hide behind one IP address, and when switching from Wi-Fi to mobile data the IP changes and the pinning is lost.

### What load balancer builders say: HAProxy

The HAProxy docs recommend leastconn exactly where sessions are very long, and say outright that it fits short HTTP requests poorly. And the HAProxy blog warns that many clients can hide behind one IP address, a client can change IP mid-session, and adding or losing a server with IP hash reshuffles all clients to other servers.

[HAProxy Configuration Manual: balance](https://docs.haproxy.org/2.8/configuration.html#4.2-balance)

[HAProxy Blog: Client IP persistence or source IP hash load balancing?](https://www.haproxy.com/blog/client-ip-persistence-or-source-ip-hash-load-balancing)

---

## Step 6. Launch in Brazil

Article section: Regionalization and latency

### Scenario

Until now we ran in Europe, and all servers are in Frankfurt. Now we’re launching in São Paulo: that’s ~9,800 km away.

Light in fiber travels at ~200,000 km/s, so physics alone gives ~100 ms round trip. Real routes give ~190 ms.

### Question

How do we serve riders in Brazil?

### Options

- **Everything in Frankfurt** — One region for everyone
- **Frankfurt + CDN** — Nearby edge servers serve static content
- **Region in São Paulo** — Own services and own DB for Brazil

### Takeaway

Distance latency can’t be removed by optimizing code, physics sets it. You can only move the data closer to the user.

**CDN** speeds up only what can be cached: map tiles, fares, images. The ride request still flies to Frankfurt.

**Regional partitioning** works because rides are local by nature: a rider in São Paulo never needs a driver from Berlin. Services and DBs live close to the user. The cost: global tasks, like a report across all countries, get harder and go through async replication between regions.

### How it’s done in practice: Uber and Slack

The article we read uses Uber as its example of regional partitioning: cities are grouped into regions with their own DB and services nearby. Slack connects the client to the nearest edge region, and when a region fails it moves users to a neighboring one.

[Slack Engineering: Real-time Messaging](https://slack.engineering/real-time-messaging/)

---

## Step 7. Ride screen

Article section: REST vs GraphQL

### Scenario

During the ride the rider sees one screen: status, driver (name, rating), car (model, plate), arrival time and price. The data lives in different services: rides, drivers, cars, ETA.



### Question

How does the mobile app get the data for the screen?

### Options

- **REST** — A separate resource per entity
- **Screen-specific REST (BFF)** — The backend builds a dedicated endpoint for this screen
- **GraphQL** — The client describes which fields it needs

### Comparison

| | REST | Screen-specific REST (BFF) | GraphQL |
|---|---|---|---|
| Requests from the phone | 🔴 4, in three sequential rounds | 🟢 1 | 🟢 1 |
| Data per screen | 🔴 12.5 KB, only 1.1 needed | 🟢 1.3 KB | 🟢 1.1 KB |
| New block on the screen | 🟡 one more resource and probably one more request | 🔴 backend changes the endpoint and ships a release | 🟢 frontend adds a field to the query |
| Many clients (iOS, Android, web, partners) | 🟢 the same resources for everyone | 🔴 a separate endpoint per screen per client | 🟢 one schema, each client picks its fields |
| CDN caching | 🟢 simple, by URL | 🟢 shared data in separate GETs gets cached | 🔴 POST isn’t cached by default, needs persisted queries |
| Server complexity | 🟢 simplest | 🟡 an endpoint per screen | 🟡 N+1 in resolvers, query complexity limits |

### Takeaway

**REST** is simple and caches well by URL, but a screen built from several resources needs several sequential requests. On a distant network each one costs a full RTT. On top of that, each resource returns all its fields, while the screen needs only a few.

**Screen-specific REST** (also called BFF, backend for frontend) gives one request, but the backend writes and maintains an endpoint for every screen and every change to it.

**GraphQL** gives one request with exactly the needed fields, and the frontend changes the screen without the backend. The cost: CDN caching is harder, and the server gets new problems, like N+1 queries in resolvers and query complexity limits.

The article recommends REST by default, and GraphQL when the frontend needs flexibility and per-screen requests become a burden.

### How it’s done in practice: GitHub

Facebook created GraphQL. In 2016 GitHub announced its public API on it, because REST accounted for over 60% of requests to their DB, and one full representation often took 2–3 calls.

[GitHub Blog: The GitHub GraphQL API](https://github.blog/2016-09-14-the-github-graphql-api/)

---

## Step 8. Ride payment

Article section: Retries and idempotency

### Scenario

When the rider taps “Request ride”, ride-service asks payments to hold the ride cost on the card: `POST /payments/hold`, 250 UAH. After the ride, this money is charged.

The mobile network is unstable. Sometimes payments manages to hold the money, but the response is lost on the way, and ride-service doesn’t know whether it went through.

### Question

What does ride-service do if no response comes back?

### Options

- **Don’t retry** — Show the rider an error
- **Retry the request** — The same POST again
- **Retry with a key** — POST with Idempotency-Key

### Comparison

| | Don’t retry | Retry the request | Retry with a key |
|---|---|---|---|
| If the response is lost | 🔴 rider sees an error | 🔴 money is held twice | 🟢 retry returns the first attempt’s result |
| Rider’s money | 🟡 250 UAH held, but the request “failed” | 🔴 500 UAH held | 🟢 250 UAH held |
| What the rider sees | 🔴 an error and requests again manually | 🟢 success | 🟢 success |
| What the server needs | 🟢 nothing | 🟢 nothing | 🟡 store the key and the first attempt’s result |
| When it fits | when a human can retry | reads (GET) and operations that give the same result on retry | any state-changing operations (POST) |

### Takeaway

When the response is lost, the client doesn’t know whether the request ran. It may not have arrived, may have failed midway, or may have succeeded.

**Don’t retry** is safe for money, but the rider sees an error even though the funds are already held, and requests again on their own.

**Retry the request** is fine for reads (GET) and for operations that give the same result when repeated. For holding money it means a double hold.

**Retry with a key**: the client generates a unique key for the operation and sends it with every attempt. The server stores the result of the first execution and returns it on a retry with the same key, doing nothing a second time. Retries become safe.

### How it’s done in practice: Stripe

Stripe describes the same three cases: the request didn’t arrive, failed midway, or succeeded but the response was lost. For POST requests the client sends an Idempotency-Key header, and on a retry the server returns the stored result of the first attempt. Along with this, Stripe recommends exponential backoff and jitter so retries don’t finish off the server, and that’s exactly what we’ll see in the incident.

[Stripe Blog: Designing robust and predictable APIs with idempotency](https://stripe.com/blog/idempotency)

---

## Step 9. Retries after a failure

Article section: Retries: backoff and jitter

### Scenario

During a deploy, dispatch-service stopped responding for 5 seconds. In that time 3,000 ride requests failed with an error, and ride-service retries them.

On top of normal traffic, dispatch can handle 1,000 extra requests per second. If more arrive, it gets overloaded and handles even fewer.

### Question

When does ride-service retry a request?

### Options

- **Every second** — Fixed 1 s pause
- **Exponential backoff** — Pause grows: 1, 2, 4, 8 s, then 8 s each
- **Backoff + jitter** — Random pause from 0 up to 2, 4, 8 s, then up to 8 s

### Comparison

| | Every second | Exponential backoff | Backoff + jitter |
|---|---|---|---|
| How retries arrive | 🔴 all at once, every second | 🔴 all at once, but less often | 🟢 spread over time, each client at its own moment |
| Load on dispatch during recovery | 🔴 waves, each one overloads | 🔴 rarer waves, each one overloads | 🟢 short, moderate overload that fades quickly |
| How long the rider waits | auto | auto | auto |
| Complexity | 🟢 simplest | 🟢 simple | 🟢 simple: one line of random() |

### Takeaway

**Fixed pause** sends all retries at once, in waves. Each wave overloads dispatch, most requests fail again and come back in the next wave.

**Exponential backoff** cuts the number of attempts but doesn’t remove the waves: everyone who failed together retries together, just less often. Each wave still overloads dispatch, and the gaps between waves grow, so recovery is the slowest.

**Backoff + jitter** adds randomness, and retries spread out over time. For the first ~2 seconds dispatch is still overloaded, but briefly and mildly, and the overload fades fast. Recovery is the fastest, with the fewest wasted requests.

Why 9 s and not ~5, if there are 5.3k requests and dispatch handles 1 000/s? An overloaded dispatch handles less than its normal rate, so in the first seconds some requests fail. Those that failed wait a random pause, so in the tail dispatch sits idle part of the time.

### How it’s done in practice: Amazon

Amazon calls retries “selfish”: a client uses more server resources to raise its own chances. Plain backoff doesn’t help, because everyone who failed together also retries together, so jitter is added on top. Also, retry at only one layer: five layers with three retries each can multiply load on the database by 243.

[AWS Builders' Library: Timeouts, retries and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)

---

## Step 10. When dispatch is down

Article section: Circuit breaker

### Scenario

dispatch-service is fully down for 30 seconds: from second 10 to second 40. During that time ride-service gets 800 ride requests per second, and each call to dispatch hangs until the 2-second timeout, then fails.

After going down, dispatch needs ~5 seconds to warm up. If all traffic hits it at once, warm-up takes longer.

### Question

What does ride-service do when dispatch stops responding en masse?

### Options

- **Nothing** — Every request goes to dispatch and waits for the timeout
- **Circuit breaker** — After a series of errors, stop calling dispatch
- **Circuit breaker + fallback** — The request is queued, the rider sees “Finding a driver”

### Comparison

| | Nothing | Circuit breaker | Circuit breaker + fallback |
|---|---|---|---|
| Requests to dead dispatch | 🔴 all, each hangs until timeout | 🟢 only probes | 🟢 only probes |
| ride-service resources | 🔴 threads and memory tied up by hanging requests | 🟢 free | 🟢 free |
| What the rider sees | 🔴 an error after 2 s | 🟡 an error right away | 🟢 “Finding a driver”, request queued |
| dispatch recovery | 🔴 slow: all traffic hits it at once | 🟢 fast: traffic returns after a successful probe request | 🟡 fast, but draining the queue creates a load spike |
| Complexity | 🟢 nothing to do | 🟡 thresholds, states, trip monitoring | 🟡 plus a queue: size limit, drain rate, what to do with stale requests |

### Takeaway

**Without a breaker** ride-service keeps hammering a dead dispatch: every rider waits 2 seconds just to get an error, and hanging requests eat ride-service memory and threads. When dispatch comes back, all traffic hits it at once, and warm-up takes longer.

**Circuit breaker** “opens” (OPEN) after a series of errors and fails fast without calling dispatch. Every few seconds it lets probe requests through (HALF-OPEN), and when a probe succeeds it “closes” again (CLOSED) and lets all traffic through at once. While dispatch is warming up, only probe requests reach it, with no flood of retries or hanging requests. Full traffic returns once it’s ready. If you need a gradual return, you add it separately (ramp-up).

**Fallback** decides what the rider sees while the breaker is open. Instead of an error, the request is queued and the rider sees “Finding a driver”. When dispatch comes back, the queue drains on top of normal traffic, which creates a load spike. So the queue is capped in size and drain rate, and stale requests (the rider already left) are dropped.

### How it’s done in practice: Martin Fowler and Amazon

Fowler describes exactly this problem: a remote call hangs until the timeout, and when there are many such calls the client runs out of resources and the failure cascades further. As a fallback he suggests, for example, queuing the request for later or showing stale but acceptable data, and logging and alerting on every breaker trip.

[Martin Fowler: CircuitBreaker](https://martinfowler.com/bliki/CircuitBreaker.html)

Amazon instead limits retries locally with a token bucket and writes that a circuit breaker adds modal behavior that makes testing harder and can slow down recovery. So it’s a tool with trade-offs, not a mandatory layer.

[AWS Builders' Library: Timeouts, retries and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
