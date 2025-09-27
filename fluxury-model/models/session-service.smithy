$version: "2.0"

namespace com.fluxury.sessions

use aws.protocols#restJson1
use com.fluxury.sessions.common#SessionSummary
use com.fluxury.sessions.common#Session
use com.fluxury.sessions.common#CreateSessionInput

@restJson1
service FluxurySessionService {
    version: "2024-04-16",
    operations: [
        ListSessions,
        GetSession,
        CreateSession,
        UpdateSession,
        DeleteSession
    ]
}

// List all sessions
@readonly
@http(method: "GET", uri: "/sessions")
operation ListSessions {
    output: ListSessionsOutput
}

structure ListSessionsOutput {
    @required
    sessions: SessionSummaries
}

list SessionSummaries {
    member: SessionSummary
}

// Get session by ID
@readonly
@http(method: "GET", uri: "/sessions/{id}")
operation GetSession {
    input: GetSessionInput,
    output: Session
}

structure GetSessionInput {
    @required
    @httpLabel
    id: String
}

// Create new session
@http(method: "POST", uri: "/sessions")
operation CreateSession {
    input: CreateSessionInput,
    output: Session
}

// Update existing session
@http(method: "PUT", uri: "/sessions/{id}")
operation UpdateSession {
    input: UpdateSessionInput,
    output: Session
}

structure UpdateSessionInput {
    @required
    @httpLabel
    id: String,
    name: String,
    script: String,
    artworkUrl: String,
    beatUrl: String
}

// Delete session
@http(method: "DELETE", uri: "/sessions/{id}")
operation DeleteSession {
    input: DeleteSessionInput
}

structure DeleteSessionInput {
    @required
    @httpLabel
    id: String
}
