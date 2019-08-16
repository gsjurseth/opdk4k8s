/*
Copyright 2019 Google Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

Object.prototype.isEmpty = function() {
    for(var key in this) {
        if(this.hasOwnProperty(key))
            return false;
    }
    return true;
}

const pr                = require('properties-reader'),
      _                 = require('lodash'),
    { URLSearchParams } = require('url'),
      fetch             = require('node-fetch');

const listOfChildren = [ "router.apigee.google.com/v1", 
  "env.apigee.google.com/v1" ];


const props = pr('/config/cluster.config');

const msProps = {
  user: props.get('ADMIN_EMAIL'),
  pass: props.get('APIGEE_ADMINPW'),
  url: 'http://mshs.apigee.svc.cluster.local:8080',
  region: props.get('REGION'),
  pod: props.get('MP_POD')
};

const newOrgBody = function(org) {
  return {
    "displayName" : `${org}`,
    "name" : `${org}`,
    "properties" : {
    },
    "type" : "paid"
  };
}

const newRouter = function(o) {
  let router =  {};
  router.apiVersion = 'apigee.google.com/v1';
  router.kind = 'router';
  router.metadata = {}
  router.metadata.name = `${o.metadata.name}-routers`;
  router.metadata.namespace = "apigee";
  router.spec = {};
  router.spec.replicants = Number(o.spec['router-replicas']);
  router.spec.org = o.spec['org_name'];
  return router;
}

const getKid = function(o) {
  let kid = Object.keys(o)[0];
  return kid;
}

const checkForOrg = async function(org) {
  let h = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': 'Basic ' + Buffer.from(`${msProps.user}:${msProps.pass}`).toString('base64')
  };
  let opts = {
    method: 'POST',
    headers: h,
    body: JSON.stringify( newOrgBody(org) )
  };
  let url = `${msProps.url}/organizations/${org}`;
  console.log('about to check for org: %s', url);
  const res = await fetch(`${msProps.url}/organizations/${org}`,opts);
  //const json = await res.json();
  const ok = res.ok;
  console.log('the whole response we got back was: %j', res);
  return ok;
}


const addUsersToOrg = async function(org) {
  let h = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json',
    'Authorization': 'Basic ' + Buffer.from(`${msProps.user}:${msProps.pass}`).toString('base64')
  };
  let opts = {
    method: 'POST',
    headers: h
  };
  let encEmail = encodeURIComponent(msProps.user);
  let url = `${msProps.url}/v1/organizations/${org}/userroles/orgadmin/users?id=${encEmail}`;
  console.log('about to add user to role with url: %s', url);
  await fetch( `${url}`, opts )
    .catch( e => {
      throw new Error("Failed adding orgadmin: " + e.stack);
    });
}

const associateOrg = async function(org) {
  let h = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json',
    'Authorization': 'Basic ' + Buffer.from(`${msProps.user}:${msProps.pass}`).toString('base64')
  };
  let opts = {
    method: 'POST',
    headers: h
  };
  let params = new URLSearchParams();
  params.append( 'region', msProps.region );
  params.append( 'pod', msProps.pod );

  opts.body = params;
  let url = `${msProps.url}/v1/organizations/${org}/pods`;
  console.log('about to add org pod and region with url: %s', url);
  await fetch(`${url}`, opts)
    .catch( e => {
      throw new Error("Failed associating org: " + e.stack);
    });
}

const createOrg = async function(org) {
  let h = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': 'Basic ' + Buffer.from(`${msProps.user}:${msProps.pass}`).toString('base64')
  };
  let opts = {
    method: 'POST',
    headers: h,
    body: JSON.stringify( newOrgBody(org) )
  };
  let url = `${msProps.url}/v1/organizations`;
  console.log('about to add org with url: %s', url);
  await fetch(`${url}`,opts)
    .catch( e => {
      throw new Error("Failed creating org: " + e.stack);
    });
}

const addOrg = async function(org) { 
  await createOrg(org);
  await associateOrg(org);
  await addUsersToOrg(org);
}

// we've passed in the org name so we can check wrt this org alone
// that is, we're not checking for the readines of any other routers
// only the ones associated with this particular org... We will not store
// the org name in status for the routers, but we will store the org status itself
// and check if it's already been created
const calculateStatus = async function(observed) {
  let allstatus = { org: {} };
  let children = observed.children;
  let parent = observed.parent;
  let org = parent.metadata.name;

  let routerChild = `${org}-routers`;

  // set everything to ready: false by default
  listOfChildren.forEach( i => { 
    if ( children.isEmpty() || children[i].isEmpty() ) {
      allstatus[i] = { ready: false };
    }
    else if (children[i][ routerChild ].status != null) {
      allstatus[i] = children[i][ routerChild ].status;
    }
    else {
      allstatus[i] = {ready: false};
    }
  });

  if ( allstatus['router.apigee.google.com/v1'].ready ) {
    let orgReady = checkForOrg(org);
    allstatus.org[ org ] = orgReady;
  }

  return allstatus;
}

module.exports = async function (context) {
  let observed = context.request.body;
  let desired = {status: {}, children: []};
  let orgStatus = { ready: false };
  let parent = observed.parent
  let children = observed.children;
  let org = parent.metadata.name;

  try {
    let status = await calculateStatus(observed);

    console.log('so the status is: %j', status);
    if (status['router.apigee.google.com/v1'].ready) {
      if ( !status.org[ org ].ready ) {
        console.log('now we are gonna try and add the org: %s', org);
        await addOrg(org);
        console.log('after we have added the org');
      }
      else {
        orgStatus.ready = true;
      }
    }
    desired.status =  { members: status, orgStatus };
    desired.children.push( newRouter(parent) );
  }
  catch (e) {
    return {status: 500, body: e.stack};
  }

  return {status: 200, body: desired, headers: {'Content-Type': 'application/json'}};
};
