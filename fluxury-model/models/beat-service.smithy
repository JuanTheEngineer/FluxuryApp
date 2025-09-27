$version: "2"

namespace com.fluxury.beats

use aws.protocols#restJson1

@restJson1
service FluxuryBeatService {
    version: "2024-04-16",
    operations: [
        ListBeats,
        GetBeat,
        CreateBeat
    ]
}

// List beats (equivalent to GET /api/beats)
@readonly
@http(method: "GET", uri: "/beats")
operation ListBeats {
    output: ListBeatsOutput
}

structure ListBeatsOutput {
    @required
    beats: BeatSummaries
}

list BeatSummaries {
    member: BeatSummary
}

structure BeatSummary {
    @required
    id: String,
    @required
    name: String,
    @required
    path: String,
    @required
    creator: String
}

// Get single beat details (additional)
@readonly
@http(method: "GET", uri: "/beats/{id}")
operation GetBeat {
    input: GetBeatInput,
    output: BeatSummary
}

structure GetBeatInput {
    @required
    @httpLabel
    id: String
}

// Create new beat (equivalent to POST /api/download)
@http(method: "POST", uri: "/beats")
operation CreateBeat {
    input: CreateBeatInput,
    output: BeatSummary
}

structure CreateBeatInput {
    @required
    url: String, // YouTube URL
    @required
    name: String,
    @required
    creator: String
}
