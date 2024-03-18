import bodyParser from "body-parser";
import express, { Request, Response } from 'express';
import { BASE_NODE_PORT } from "../config";
import { NodeState, Value } from "../types";
import { delay } from "../utils";
import http from "http";
import { ErrorRequestHandler } from "express";


export async function node(
  nodeId: number, // the ID of the node
  N: number, // total number of nodes in the network
  F: number, // number of faulty nodes in the network
  initialValue: Value, // initial value of the node
  isFaulty: boolean, // true if the node is faulty, false otherwise
  nodesAreReady: () => boolean, // used to know if all nodes are ready to receive requests
  setNodeIsReady: (index: number) => void // this should be called when the node is started and ready to receive requests
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

  // TODO implement this
  // this route allows retrieving the current status of the node
  // node.get("/status", (req, res) => {});
  
  let currentNodeState: NodeState = {
    killed: false,
    x: null,
    decided: null,
    k: null,
  }
  let proposals: Map<number, Value[]> = new Map();
  let votes: Map<number, Value[]> = new Map();

  node.get("/status", (req, res) => {
    if (isFaulty) {
      res.status(500).send("faulty");
    } else {
      res.status(200).send("live");
    }
  });
  node.get("/getState", (req, res) => {
    if (isFaulty) {
      res.json({
        killed: false, // Assuming the 'killed' flag is managed elsewhere in your code
        x: null,
        decided: null,
        k: null
      });
    } else {
      // Assuming you have a way to access the current state
      // You might need to implement logic to manage the current state
      res.json({
        killed: false, // or the actual state
        x: initialValue, // or the current consensus value
        decided: false, // or the actual state
        k: 0 // or the current step
      });
    }
  });

  //get state of current node
  node.get("/getState", (req, res) => {
    res.status(200).send(currentNodeState);
  });

//Start concensus algorithm
  node.get("/start", async (req, res) => {
    // Wait until all nodes are ready
    while (!nodesAreReady()) {
      await delay(5);
    }

    // If node is not faulty, start consensus algorithm
    if (!isFaulty) {
      currentNodeState = { k: 1, x: initialValue, decided: false, killed: currentNodeState.killed };
      // Send proposal to all nodes
      for (let i = 0; i < N; i++) {
        fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ k: currentNodeState.k, x: currentNodeState.x, messageType: "propose" }),
        });
      }
    } else {
      // If node is faulty, reset state
      currentNodeState = { k: null, x: null, decided: null, killed: currentNodeState.killed };
    }

    res.status(200).send("Consensus algorithm started.");
  });
//stop node
  node.get("/stop", (req, res) => {
    currentNodeState.killed = true;
    res.status(200).send("killed");
  });
    // TODO implement this
  // this route allows the node to receive messages from other nodes
  // node.post("/message", (req, res) => {});
  node.post("/message", async (req, res) => {
    let { k, x, messageType } = req.body;
    if (!isFaulty && !currentNodeState.killed) {
      if (messageType == "propose") {
        if (!proposals.has(k)) {
          proposals.set(k, []);
        }
        proposals.get(k)!.push(x); // Use '!' to assert non-null after the check
        let proposal = proposals.get(k)!;

        if (proposal.length >= (N - F)) {
          let count0 = proposal.filter((el) => el == 0).length;
          let count1 = proposal.filter((el) => el == 1).length;
          if (count0 > (N / 2)) {
            x = 0;
          } else if (count1 > (N / 2)) {
            x = 1;
          } else {
            x = "?";
          }
          for (let i = 0; i < N; i++) {
            fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ k: k, x: x, messageType: "vote" }),
            });
          }
        }
      }
      else if (messageType == "vote") {
        if (!votes.has(k)) {
          votes.set(k, []);
        }
        votes.get(k)!.push(x)
        let vote = votes.get(k)!;
          if (vote.length >= (N - F)) {
            let count0 = vote.filter((el) => el == 0).length;
            let count1 = vote.filter((el) => el == 1).length;

            if (count0 >= F + 1) {
              currentNodeState.x = 0;
              currentNodeState.decided = true;
            } else if (count1 >= F + 1) {
              currentNodeState.x = 1;
              currentNodeState.decided = true;
            } else {
              if (count0 + count1 > 0 && count0 > count1) {
                currentNodeState.x = 0;
              } else if (count0 + count1 > 0 && count0 < count1) {
                currentNodeState.x = 1;
              } else {
                currentNodeState.x = Math.random() > 0.5 ? 0 : 1;
              }
              currentNodeState.k = k + 1;

              for (let i = 0; i < N; i++) {
                fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({k: currentNodeState.k, x: currentNodeState.x, messageType: "propose"}),
                });

            }
          }
        }
      }
    }
    res.status(200).send("Message received and processed.");
  });

  
  function processVote(message: any) {
    // Process the vote here
    console.log("Received vote:", message);
  }
  
  function processProposal(message: any) {
    // Process the proposal here
    console.log("Received proposal:", message);
  }
  function handleMessage(message: any) {
    // Process the message here
    console.log("Received message:", message);

    if (message.type === 'vote') {
      processVote(message);
    } else if (message.type === 'proposal') {
      processProposal(message);
    }
  }
  // TODO implement this
  // this route is used to start the consensus algorithm
  // node.get("/start", async (req, res) => {});

  // TODO implement this
  // this route is used to stop the consensus algorithm
  // node.get("/stop", async (req, res) => {});

  // TODO implement this
  // get the current state of a node
  // node.get("/getState", (req, res) => {});

  // start the server
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(
      `Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`
    );

    // the node is ready
    setNodeIsReady(nodeId);
  });

  return server;
}
