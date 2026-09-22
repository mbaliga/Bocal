package com.bocal.music.session

import dev.aarso.session.LocalSessionLedger
import dev.aarso.session.ParticipantId
import dev.aarso.session.SessionId
import dev.aarso.session.SessionRole
import dev.aarso.session.LocalSessionTransport
import dev.aarso.session.SessionPacketListener
import dev.aarso.session.TcpLocalSessionHost
import dev.aarso.session.TcpLocalSessionTransport

/** Bocal's beta host bridge; platform discovery/transport is deliberately injected by the app. */
class LocalSessionBridge(
    sessionId: String,
    participantId: String,
) {
    private val ledger = LocalSessionLedger(
        sessionId = SessionId(sessionId),
        localParticipant = ParticipantId(participantId),
        role = SessionRole.HOST,
    )

    fun snapshot() = ledger.snapshot()

    fun appendLocalEvent(sequence: Long, eventId: String, payload: String) =
        ledger.localEvent(sequence, eventId, payload)

    fun connect(host: String, port: Int, listener: SessionPacketListener): LocalSessionTransport =
        TcpLocalSessionTransport.connect(host, port, listener)

    fun host(
        port: Int,
        listener: SessionPacketListener,
        onConnection: (LocalSessionTransport) -> Unit,
    ): TcpLocalSessionHost = TcpLocalSessionHost.bind(port, listener, onConnection).start()
}
