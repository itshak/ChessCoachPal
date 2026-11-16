#!/usr/bin/env python3
"""Forced-command SSH entrypoint. Only released ChessCoachPal tags may deploy."""
import json, os, re, subprocess, sys, time, urllib.error, urllib.request
from pathlib import Path

APP_UUID = "wu2pa46yyr4ssws9d1tah0ct"
API = "http://127.0.0.1:8000/api/v1"
TOKEN = Path("/var/lib/chesscoachpal-deploy/.config/coolify-api-token")
REPOSITORY = "https://github.com/itshak/ChessCoachPal.git"
CMD = os.environ.get("SSH_ORIGINAL_COMMAND", "")

def call(method, path, data=None):
    key = TOKEN.read_text().strip()
    req = urllib.request.Request(API+path, method=method,
        headers={"Authorization":"Bearer "+key,"Accept":"application/json",
                 "Content-Type":"application/json"},
        data=json.dumps(data).encode() if data is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return json.load(r)
    except urllib.error.HTTPError as exc:
        print("COOLIFY_HTTP_ERROR",exc.code,file=sys.stderr,flush=True)
        raise

def get_app():
    return call("GET","/applications/"+APP_UUID)

def current_status():
    a=get_app()
    print("staging",a.get("status"),"branch",a.get("git_branch"),
          "sha",a.get("git_commit_sha"),flush=True)

def validated_release(tag, expected_sha):
    # A tag by itself is not enough: only an actual published GitHub Release
    # can cause a staging update. This endpoint works for the public repository.
    release_url = ("https://api.github.com/repos/itshak/ChessCoachPal/"
                   "releases/tags/" + tag)
    req = urllib.request.Request(release_url,headers={
        "Accept":"application/vnd.github+json",
        "User-Agent":"ChessCoachPal-Coolify-release-deploy"})
    with urllib.request.urlopen(req, timeout=25) as response:
        release=json.load(response)
    if release.get("draft") or release.get("tag_name") != tag or not release.get("published_at"):
        raise ValueError("Tag has no published GitHub release")
    refs = ["refs/tags/"+tag, "refs/tags/"+tag+"^{}"]
    p = subprocess.run(["/usr/bin/git","ls-remote","--tags",REPOSITORY,*refs],
             cwd="/var/lib/chesscoachpal-deploy",
             capture_output=True,text=True,timeout=45,check=True)
    resolved = {x.split("\t",1)[1]:x.split("\t",1)[0]
                for x in p.stdout.splitlines() if "\t" in x}
    commit = resolved.get(refs[1], resolved.get(refs[0]))
    if commit != expected_sha:
        raise ValueError("Release tag does not point to supplied commit SHA")
    print("RELEASE_REF_VERIFIED",tag,expected_sha,flush=True)

def do_deploy(tag, sha):
    validated_release(tag,sha)
    a=get_app()
    if a.get("uuid")!=APP_UUID:
        raise ValueError("Unexpected Coolify app UUID")
    # API token has write+deploy grants scoped to this one resource only.
    call("PATCH","/applications/"+APP_UUID, {
        "git_branch":tag,
        "git_commit_sha":sha,
        "is_auto_deploy_enabled":False
    })
    r=call("POST","/deploy",{"uuid":APP_UUID,"force":True,
                           "cancel_previous":"queued"})
    deployments=r.get("deployments",[])
    deployment=next((x.get("deployment_uuid") for x in deployments
                      if x.get("resource_uuid")==APP_UUID and x.get("deployment_uuid")),None)
    if not deployment:
        raise RuntimeError("Coolify refused deployment "+str(r)[:280])
    print("DEPLOYMENT_QUEUED",deployment,flush=True)
    end=time.monotonic()+2400
    last=None
    while time.monotonic()<end:
        record=call("GET","/deployments/"+deployment)
        status=record.get("status")
        if status!=last:
            print("DEPLOYMENT_STATUS",status,flush=True)
            last=status
        if status=="finished":
            current_status()
            print("DEPLOYMENT_FINISHED",deployment,flush=True)
            return
        if status in ("failed","cancelled","cancelled-by-user"):
            raise RuntimeError("Coolify deployment ended in "+str(status))
        time.sleep(12)
    raise TimeoutError("Coolify deployment timed out after 40 minutes")

def main():
    if CMD=="status":
        current_status()
        return
    match=re.fullmatch(r"deploy (v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?) ([a-f0-9]{40})",CMD)
    if not match:
        raise ValueError("Refused: only status or deploy <SemVer tag> <40-character SHA> is allowed")
    do_deploy(*match.groups())

if __name__=="__main__":
    try:main()
    except Exception as e:
        print("DEPLOY_HOOK_FAILED",type(e).__name__,str(e)[:240],file=sys.stderr,flush=True)
        sys.exit(1)
