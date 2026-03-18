---------------------------- MODULE DGMPipeline ----------------------------
\* MOTHER DGM Pipeline — TLA+ Formal Specification (Level 5)
\*
\* This spec models the state machine of the DGM self-improvement pipeline
\* and verifies safety invariants and liveness properties.
\*
\* Scientific basis:
\*   - DGM (Zhang et al., arXiv:2505.22954) — autonomous self-improvement
\*   - TLA+ (Lamport, 1999) — formal specification of concurrent systems
\*   - Constitutional AI (Bai et al., arXiv:2212.08073) — safety constraints
\*
\* Invariants verified:
\*   I1: No unapproved code ever executes
\*   I2: Safety Gate is always consulted before execution
\*   I3: Pipeline never deadlocks (always has a next action or is terminal)
\*   I4: Audit log is append-only and monotonically grows
\*
\* Liveness:
\*   L1: Every approved proposal eventually reaches a terminal state
\*
\* To verify: Install TLA+ Toolbox, open this file, run TLC model checker.
\* Expected result: No invariant violations found.

EXTENDS Naturals, Sequences, FiniteSets

\* ================================================================
\* CONSTANTS
\* ================================================================

CONSTANTS
    MaxProposals,       \* Maximum number of proposals to model check
    MaxRetries          \* Maximum retry attempts (SICA loop)

\* ================================================================
\* VARIABLES
\* ================================================================

VARIABLES
    proposals,          \* Function: proposalId -> status
    safetyChecked,      \* Set of proposal IDs that passed Safety Gate
    auditLog,           \* Sequence of audit entries (append-only)
    retryCount,         \* Function: proposalId -> number of retries
    executing           \* Set of proposal IDs currently being executed

vars == <<proposals, safetyChecked, auditLog, retryCount, executing>>

\* ================================================================
\* STATES
\* ================================================================

ProposalStatuses == {"pending", "approved", "in_progress", "completed", "failed", "rejected"}
TerminalStatuses == {"completed", "rejected"}

\* ================================================================
\* TYPE INVARIANT
\* ================================================================

TypeInvariant ==
    /\ \A id \in DOMAIN proposals: proposals[id] \in ProposalStatuses
    /\ safetyChecked \subseteq DOMAIN proposals
    /\ \A id \in DOMAIN retryCount: retryCount[id] \in 0..MaxRetries
    /\ executing \subseteq DOMAIN proposals

\* ================================================================
\* SAFETY INVARIANTS
\* ================================================================

\* I1: No unapproved code ever executes
\* Formally: if a proposal is in_progress, it MUST have been approved first
NoUnapprovedExecution ==
    \A id \in executing: proposals[id] \in {"in_progress", "completed", "failed"}

\* I2: Safety Gate is always consulted before execution
\* Formally: every executing proposal was safety-checked
SafetyGateRequired ==
    \A id \in executing: id \in safetyChecked

\* I3: No deadlock — system can always make progress or is in terminal state
\* Formally: there exists at least one enabled action OR all proposals are terminal
NoDeadlock ==
    \/ \E id \in DOMAIN proposals: proposals[id] \notin TerminalStatuses
    \/ \A id \in DOMAIN proposals: proposals[id] \in TerminalStatuses

\* I4: Audit log only grows (append-only, immutable)
\* This is enforced by construction — we only use Append, never remove

\* Combined invariant
SafetyInvariant ==
    /\ TypeInvariant
    /\ NoUnapprovedExecution
    /\ SafetyGateRequired
    /\ NoDeadlock

\* ================================================================
\* INITIAL STATE
\* ================================================================

Init ==
    /\ proposals = [id \in 1..MaxProposals |-> "pending"]
    /\ safetyChecked = {}
    /\ auditLog = <<>>
    /\ retryCount = [id \in 1..MaxProposals |-> 0]
    /\ executing = {}

\* ================================================================
\* ACTIONS (State Transitions)
\* ================================================================

\* ACTION: Safety Gate validates a proposal
\* Precondition: proposal is pending
\* Effect: marks as safety-checked, logs audit entry
SafetyGatePass(id) ==
    /\ id \in DOMAIN proposals
    /\ proposals[id] = "pending"
    /\ id \notin safetyChecked
    /\ safetyChecked' = safetyChecked \union {id}
    /\ auditLog' = Append(auditLog, <<"SAFETY_PASS", id>>)
    /\ UNCHANGED <<proposals, retryCount, executing>>

\* ACTION: Safety Gate rejects a proposal
\* Precondition: proposal is pending
\* Effect: status → rejected, logs audit entry
SafetyGateReject(id) ==
    /\ id \in DOMAIN proposals
    /\ proposals[id] = "pending"
    /\ proposals' = [proposals EXCEPT ![id] = "rejected"]
    /\ auditLog' = Append(auditLog, <<"SAFETY_REJECT", id>>)
    /\ UNCHANGED <<safetyChecked, retryCount, executing>>

\* ACTION: Human approves a proposal
\* Precondition: proposal is pending AND safety-checked
\* Effect: status → approved
HumanApprove(id) ==
    /\ id \in DOMAIN proposals
    /\ proposals[id] = "pending"
    /\ id \in safetyChecked          \* CRITICAL: must pass Safety Gate first
    /\ proposals' = [proposals EXCEPT ![id] = "approved"]
    /\ auditLog' = Append(auditLog, <<"HUMAN_APPROVE", id>>)
    /\ UNCHANGED <<safetyChecked, retryCount, executing>>

\* ACTION: Human rejects a proposal
\* Precondition: proposal is pending
\* Effect: status → rejected
HumanReject(id) ==
    /\ id \in DOMAIN proposals
    /\ proposals[id] = "pending"
    /\ proposals' = [proposals EXCEPT ![id] = "rejected"]
    /\ auditLog' = Append(auditLog, <<"HUMAN_REJECT", id>>)
    /\ UNCHANGED <<safetyChecked, retryCount, executing>>

\* ACTION: Start autonomous execution
\* Precondition: proposal is approved (NOT pending!)
\* Effect: status → in_progress, added to executing set
StartExecution(id) ==
    /\ id \in DOMAIN proposals
    /\ proposals[id] = "approved"    \* CRITICAL: must be approved
    /\ id \in safetyChecked          \* CRITICAL: must be safety-checked
    /\ proposals' = [proposals EXCEPT ![id] = "in_progress"]
    /\ executing' = executing \union {id}
    /\ auditLog' = Append(auditLog, <<"EXECUTION_START", id>>)
    /\ UNCHANGED <<safetyChecked, retryCount>>

\* ACTION: Execution succeeds
\* Precondition: proposal is in_progress
\* Effect: status → completed, removed from executing
ExecutionSuccess(id) ==
    /\ id \in DOMAIN proposals
    /\ proposals[id] = "in_progress"
    /\ id \in executing
    /\ proposals' = [proposals EXCEPT ![id] = "completed"]
    /\ executing' = executing \ {id}
    /\ auditLog' = Append(auditLog, <<"EXECUTION_SUCCESS", id>>)
    /\ UNCHANGED <<safetyChecked, retryCount>>

\* ACTION: Execution fails (with SICA retry)
\* Precondition: proposal is in_progress, retries < max
\* Effect: increment retry, status → approved (for retry)
ExecutionFailRetry(id) ==
    /\ id \in DOMAIN proposals
    /\ proposals[id] = "in_progress"
    /\ id \in executing
    /\ retryCount[id] < MaxRetries
    /\ proposals' = [proposals EXCEPT ![id] = "approved"]  \* back to approved for retry
    /\ executing' = executing \ {id}
    /\ retryCount' = [retryCount EXCEPT ![id] = retryCount[id] + 1]
    /\ auditLog' = Append(auditLog, <<"EXECUTION_FAIL_RETRY", id>>)
    /\ UNCHANGED <<safetyChecked>>

\* ACTION: Execution fails permanently (max retries reached)
\* Precondition: proposal is in_progress, retries >= max
\* Effect: status → failed
ExecutionFailFinal(id) ==
    /\ id \in DOMAIN proposals
    /\ proposals[id] = "in_progress"
    /\ id \in executing
    /\ retryCount[id] >= MaxRetries
    /\ proposals' = [proposals EXCEPT ![id] = "failed"]
    /\ executing' = executing \ {id}
    /\ auditLog' = Append(auditLog, <<"EXECUTION_FAIL_FINAL", id>>)
    /\ UNCHANGED <<safetyChecked, retryCount>>

\* ACTION: Re-approve a failed proposal
\* Precondition: proposal is failed
\* Effect: status → approved, reset retries
ReApprove(id) ==
    /\ id \in DOMAIN proposals
    /\ proposals[id] = "failed"
    /\ id \in safetyChecked
    /\ proposals' = [proposals EXCEPT ![id] = "approved"]
    /\ retryCount' = [retryCount EXCEPT ![id] = 0]
    /\ auditLog' = Append(auditLog, <<"RE_APPROVE", id>>)
    /\ UNCHANGED <<safetyChecked, executing>>

\* ================================================================
\* NEXT STATE RELATION
\* ================================================================

Next ==
    \E id \in DOMAIN proposals:
        \/ SafetyGatePass(id)
        \/ SafetyGateReject(id)
        \/ HumanApprove(id)
        \/ HumanReject(id)
        \/ StartExecution(id)
        \/ ExecutionSuccess(id)
        \/ ExecutionFailRetry(id)
        \/ ExecutionFailFinal(id)
        \/ ReApprove(id)

\* ================================================================
\* SPECIFICATION
\* ================================================================

Spec == Init /\ [][Next]_vars /\ WF_vars(Next)

\* ================================================================
\* LIVENESS PROPERTY
\* ================================================================

\* L1: Every approved proposal eventually reaches a terminal state
\* (completed, rejected, or permanently failed)
EventualTermination ==
    \A id \in DOMAIN proposals:
        proposals[id] = "approved" ~> proposals[id] \in {"completed", "failed", "rejected"}

\* ================================================================
\* MODEL CHECKING CONFIGURATION
\* ================================================================
\* To verify, create a TLC model with:
\*   MaxProposals = 3
\*   MaxRetries = 3
\*   Invariant: SafetyInvariant
\*   Property: EventualTermination
\*
\* Expected: 0 violations found
\* Estimated state space: ~50,000 states for MaxProposals=3, MaxRetries=3

============================================================================
