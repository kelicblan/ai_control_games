using System;

namespace CampMind.Foundation
{
    /// <summary>Transport-neutral command identity. The host owns deduplication and payload validation.</summary>
    public sealed class CommandEnvelope<T> where T : class
    {
        public string CommandId { get; }
        public string SessionId { get; }
        public string ActorId { get; }
        public WorldVersion ExpectedVersion { get; }
        public string Type { get; }
        public T Payload { get; }
        public CommandEnvelope(string commandId, string sessionId, string actorId, WorldVersion expectedVersion, string type, T payload)
        {
            CommandId = WorldVersion.RequireId(commandId, nameof(commandId));
            SessionId = WorldVersion.RequireId(sessionId, nameof(sessionId));
            ActorId = WorldVersion.RequireId(actorId, nameof(actorId));
            ExpectedVersion = expectedVersion ?? throw new ArgumentNullException(nameof(expectedVersion));
            Type = WorldVersion.RequireId(type, nameof(type));
            Payload = payload ?? throw new ArgumentNullException(nameof(payload));
        }
    }
}
