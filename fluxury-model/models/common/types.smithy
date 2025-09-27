$version: "2.0"

namespace com.fluxury.sessions.common

structure SessionSummary {
    @required
    id: String
    @required
    name: String
    @required
    createdTime: Timestamp
    @required
    modifiedTime: Timestamp
}

structure Session {
    @required
    id: String
    @required
    name: String
    @required
    script: String,  // typically an S3 URI or inline Quill Delta JSON
    @required
    artworkUrl: String
    @required
    beatUrl: String
    @required
    createdTime: Timestamp
    @required
    modifiedTime: Timestamp
}

structure CreateSessionInput {
    @required
    name: String,
    @required
    script: String, // Quill Delta JSON
    artworkUrl: String,
    beatUrl: String
}
